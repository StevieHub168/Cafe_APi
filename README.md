# Laptop shop API

Express 5 + TypeScript + Sequelize (MySQL) backend of the laptop shop: products (laptops with a QR code), bookings, repairs,
invoices, users and the Telegram messages. The web app is `Cafe_POS`.

## Set up

1. `npm install`
2. Make the database (an empty one): run `schema.sql` in MySQL (it makes `laptop_repair_db`).
3. Make a `.env` file next to `package.json`:

   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=8889            # MAMP's MySQL
   DB_USER=root
   DB_PASSWORD=...
   DB_NAME=laptop_repair_db
   JWT_SECRET=...          # REQUIRED: a long random text. The server will not start without it.
   JWT_EXPIRE=24h
   PUBLIC_APP_URL=         # the address the QR codes open, e.g. https://thastore.example (no slash at the end)
   INVOICE_START_NUMBER=41 # the number of the first digital invoice
   # Telegram (optional): TELEGRAM_SOLD_BOT_TOKEN / TELEGRAM_SOLD_CHAT_ID, TELEGRAM_REPAIR_..., TELEGRAM_BOOKING_...
   ```
4. `npm run seed` makes the Mac and Windows categories. `npm run seed:demo` adds fake demo laptops (safe to run again).

## Run it

| Command | What it does |
|---|---|
| `npm run build` | Compiles `src/` to `dist/` (TypeScript → JavaScript). |
| `npm start` | Runs the compiled server: `node dist/server.js`. Build first, and run it again after every code change. |
| `npm run dev` | Runs the TypeScript directly and restarts on every change (for coding). |
| `npm run typecheck` | Checks all types, including the tests. |
| `npm test` | Runs the tests (see "Tests"). |
| `npm run seed`, `npm run seed:demo` | The seeders above. |

When the server starts it adds the tables and columns that were made after the first version (`src/database/ensure-schema.ts`).
It only adds what is missing.

## Where things are

```
src/
  server.ts                 starts the server (database, schema check, listen)
  app.ts                    the Express app: CORS, JSON, /uploads, the routes, the error handler
  config/                   auth.config.ts (JWT secret), sequelize.config.ts (database settings)
  enums/                    every fixed list of values, written once (booking status, warranty, role, ...)
  errors/app-error.ts       AppError: an error the person is meant to read (400, 401, 403, 404, 409, 429)
  middleware/               auth (sign-in, admin only), error handler, login limiter
  routes/                   which address goes to which controller
  controllers/              read the request, call a service, write the answer. No rules, no try / catch.
  services/                 the shop's RULES: checks, what happens when a laptop is booked, repaired, sold
  repositories/             the ONLY place that talks to the database (Sequelize, and a few careful SQL statements)
  models/                   one Sequelize model per table (columns and relations)
  database/                 database.ts (the connection), ensure-schema.ts, the seeders, db-errors.ts
  utils/                    small helpers: clean* (checks of what was typed), uploads, json
test/                       the tests
schema.sql                  the tables of a new database
```

### How a request flows

`routes` → `middleware` (signed in? admin?) → `controller` → `service` (the rules) → `repository` → `model` → MySQL.
To change a rule, look in the service. To change how something is read or saved, look in the repository.
A new table: a model, a repository, a service, a controller, a route file, and one line in `app.ts` and `database.ts`.

### Errors

- A service throws an `AppError` for anything the person should read: `badRequest('Full price must be more than 0')` (400),
  `notFound('Booking')` (404), `conflict('This laptop is already booked')` (409), `unauthorized(...)` (401), `forbidden(...)` (403).
- Controllers have no try / catch. Express 5 sends a thrown error of an async handler to `middleware/error-handler.middleware.ts`,
  which answers `{ "error": "<message>" }` with the right status.
- Any other error (a bug, the database is down) is written to the log and answered as a 500 `Something went wrong. Please try again.`
  The person never sees SQL text or a stack.

### Sign-in and safety

- Sign in gives a token that is also saved in `users.access_token`. A token works only while it is the saved one: logging out
  (or signing in somewhere else) replaces it. A user has ONE saved token.
- 8 wrong passwords in a row for the same email from the same place block the login for 15 minutes.
- Any website may call the API (CORS) on purpose: the web app is opened from changing addresses (quick tunnels) and signs in with
  a token, not a cookie.
- Admin only: register, user info, the Users page. Every other page needs a signed-in user.

### Sequelize notes (why some things look the way they do)

- `src/config/sequelize.config.ts` turns on `FOUND_ROWS`: an update counts a row that MATCHED, even when no value changed. Sequelize
  turns it off by default, and then saving a product with the same values would fail as "no changes".
- Times are read and written with this computer's own offset (for example `+07:00`), as before.
- The reads of bookings and repairs stay as SQL in their repositories (`DATE_FORMAT` so a date is plain text and a time zone can never
  move a day, a fallback photo by laptop name, the Sale joined in). So do the one-statement "first person wins" updates in
  the product repository (`takeOne`, `putBackOne`): they must be ONE statement, so two people can never take the same single laptop.
- Money comes out of MySQL as text ("1050.00"). The repositories hand numbers on where they always did (bookings, repairs, invoices);
  a product's `selling_price` is still text, as it was.

## Tests

```bash
npm test                                           # the unit tests (no database needed)
TEST_DB_NAME=laptop_repair_test npm test           # also the flow test
```

- **Unit tests** (`test/*.test.ts`): the error type, the error handler, the login limit, the JWT settings, sign-in, logout, the
  token check, and the app's sign-in wall. They need no database.
- **Flow test** (`test/flows/`): 243 steps through the real HTTP API against a throwaway database (sign in, categories and brands,
  products, bookings, repairs, invoices, and every mistake a person can make). Every answer and everything stored must match
  `test/flows/golden.json`, which is what the original JavaScript API answered. So a refactor can be proven not to change anything.
  - The database name must end with `_test`: it is DROPPED and made again from `schema.sql`. Never the shop's database.
  - Telegram is switched off (nothing is sent) and uploads go to a temporary folder.
  - When an answer is changed ON PURPOSE: `TEST_DB_NAME=laptop_repair_test UPDATE_GOLDEN=1 npm test` writes a new snapshot. Read the
    diff of `golden.json` before you commit it.

## API

Everything is under `/api` and needs `Authorization: Bearer <token>`, except login.

| Address | What |
|---|---|
| `POST /auth/login`, `POST /auth/telegram-login`, `POST /auth/logout`, `GET /auth/me` | sign in and out |
| `POST /auth/register`, `GET /auth/user/:id` | admin only. Register adds a member: `email` and `password` (8 to 72 characters) are needed; `full_name`, `role` (`staff` or `admin`, default staff), `phone` and `username` are optional. Without a `username` it is made from the email (`mony@x.com` gives `mony`, and `mony2` when that is taken). A username that is written and taken is a 409. |
| `GET /users`, `PUT /users/:id/password` | admin only: who can sign in, reset a password |
| `GET/POST /categories`, `GET/PUT/DELETE /categories/:id`, `POST /categories/:id/brands`, `PUT/DELETE /categories/:id/brands/:name` | Mac / Windows and their brands |
| `GET/POST /products`, `GET /products/low-stock`, `GET /products/by-code/:code`, `GET/PUT/DELETE /products/:id` | laptops |
| `GET/POST /bookings`, `GET/PUT/DELETE /bookings/:id`, `POST /bookings/:id/pickup` | bookings (pickup makes the Sale) |
| `GET/POST /repairs`, `GET/PUT/DELETE /repairs/:id` | repairs |
| `GET/POST /invoices`, `GET /invoices/next-number`, `GET/PUT/DELETE /invoices/:id` | invoices (sale, booking, repair) |
| `GET /telegram/status`, `POST /telegram/send` | messages to the Telegram groups |
| `POST /uploads/image`, `DELETE /uploads/:name` | photos (sent as base64, saved as files in `uploads/`) |
| `GET /config` | the address the QR codes open |

Photos are saved as files in `uploads/` (or `UPLOAD_DIR`) and served at `/uploads/<name>`. The database stores only the short path.

### Pages (pagination)

The lists of invoices, bookings, repairs, products and users can come one page at a time. It is opt-in: with no `page` and no
`per_page` in the address, the answer is the same plain array as always (nothing old breaks).

```
GET /api/invoices?type=sale&period=month&page=2&per_page=10
```

```json
{ "page": 2, "per_page": 10, "total": 34, "total_pages": 4, "results": [ ... ], "meta": { "counts": { "all": 34, "month": 12, "warranty": 20 } } }
```

- `page` starts at 1 (default 1), `per_page` is 1 to 100 (default 20). Anything else is a 400 with a plain message. `total_pages` is at least 1.
- The filters work with and without pages. `search` is done by the database, so it finds in ALL rows, not only the page on screen.

| List | Filters | `meta.counts` (for the tabs, NOT narrowed by `search`) |
|---|---|---|
| `/invoices` | `type` (sale, booking, repair), `period` (`month`, `warranty`), `search` (number, customer, Telegram, phone digits, item names) | `{ all, month, warranty }` of that `type` |
| `/bookings` | `status`, `exclude_status`, `search` | `{ booked, picked_up, cancelled }` |
| `/repairs` | `status`, `search` | `{ received, fixed, picked_up }` |
| `/products` | `include_archived`, `category_id`, `brand`, `search` | none |
| `/users` | none | none |

- The order is fixed (newest first, then the id), so a row never shows on two pages.
- Code: `src/utils/pagination.ts` (the contract), `src/utils/search.ts` (safe search text). Tests: `test/pagination.test.ts` and `test/flows/pagination.test.ts`.

## Not done yet

- Database transactions for the multi-step flows (booking pick-up, booking hold, sale). Only the category and invoice deletes use one.
- Permissions per action (today any signed-in user can delete; only users and register are admin-only).
- Numbered SQL migration files instead of `ensure-schema.ts`.
