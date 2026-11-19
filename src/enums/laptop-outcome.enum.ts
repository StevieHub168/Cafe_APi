/** What happened to the laptop when a booking was picked up (answered to the app as `laptop`). */
export enum LaptopOutcome {
    /** a single laptop: archived (hidden from the Menu) */
    HIDDEN = 'hidden',
    /** counted stock whose unit was already taken when it was booked: stays as it is */
    STOCK_KEPT = 'stock_kept',
    /** counted stock of an OLD booking (made before bookings took a unit): one less now */
    STOCK_LOWERED = 'stock_lowered',
    /** no laptop of the shop */
    NONE = 'none',
    /** the Sale is made, but marking the laptop did not work */
    FAILED = 'failed'
}
