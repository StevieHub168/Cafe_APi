/** The values of an enum as SQL: 'booked', 'picked_up', 'cancelled' (for the ENUM(...) of a column). */
export const sqlList = (values: string[]): string => values.map(value => `'${value}'`).join(', ');

/** The code of a product made from its id: LP-0042 (more digits only after 9999). */
export const CODE_FROM_ID = "CONCAT('LP-', IF(id < 10000, LPAD(id, 4, '0'), CAST(id AS CHAR)))";
