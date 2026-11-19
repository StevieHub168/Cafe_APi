/** Where a booking is: waiting for the customer, picked up (it became a Sale), or cancelled. */
export enum BookingStatus {
    BOOKED = 'booked',
    PICKED_UP = 'picked_up',
    CANCELLED = 'cancelled'
}
