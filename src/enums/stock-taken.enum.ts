/** What taking (or giving back) one laptop did. */
export enum StockTaken {
    /** counted stock: one less (or one more) */
    STOCK = 'stock',
    /** a single laptop: set aside (or free again) */
    SINGLE = 'single'
}
