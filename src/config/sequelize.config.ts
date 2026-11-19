import { SequelizeOptions } from 'sequelize-typescript';

/** The offset of this computer from UTC, e.g. "+07:00". Sequelize reads and writes times with it (the shop's own clock, as before). */
function localOffset(): string {
    const minutes = -new Date().getTimezoneOffset();
    const abs = Math.abs(minutes);
    return `${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** The database settings. Read when the server starts, after the .env was loaded. */
export function sequelizeConfig(): SequelizeOptions {
    return {
        dialect: 'mysql',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 3306,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        logging: false,
        timezone: localOffset(),
        pool: { max: 10 },
        // Sequelize turns this off by default. It makes an update count a row that MATCHED even when no value changed
        // (saving a product with the same values is fine, not "no changes").
        dialectOptions: { flags: '+FOUND_ROWS' }
    };
}
