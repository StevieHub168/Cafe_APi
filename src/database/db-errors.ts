// What the database says when it refuses something, read the same way whatever the driver wraps it in
// (Sequelize puts the MySQL error in `original` / `parent`).
type DriverError = { code?: string; sqlMessage?: string; original?: DriverError; parent?: DriverError };

const driverOf = (error: unknown): DriverError => {
    const e = (error ?? {}) as DriverError;
    return e.original ?? e.parent ?? e;
};

/** True when a unique key refused the row ("this number / sku / email is already there"). */
export const isDuplicateEntry = (error: unknown): boolean => driverOf(error).code === 'ER_DUP_ENTRY';

/** MySQL's own words, e.g. "Duplicate entry '41' for key 'invoices.uq_invoices_number'" (the name of the key is in it). */
export const sqlMessageOf = (error: unknown): string => driverOf(error).sqlMessage ?? '';
