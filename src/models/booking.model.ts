import 'reflect-metadata';
import { AutoIncrement, BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';
import { BookingStatus } from '../enums/booking-status.enum';
import Product from './product.model';

/** A customer reserves a laptop with a deposit and will pick it up on a set date. Dates are plain "YYYY-MM-DD" text. */
@Table({ tableName: 'bookings', createdAt: 'created_at', updatedAt: 'updated_at' })
export default class Booking extends Model {
    @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
    declare id: number;

    @ForeignKey(() => Product) @Column({ type: DataType.INTEGER, allowNull: true })
    declare product_id: number | null;

    @Column({ type: DataType.STRING(255), allowNull: false })
    declare product_name: string;

    @Column({ type: DataType.STRING(20), allowNull: true })
    declare phone: string | null;

    @Column({ type: DataType.STRING(40), allowNull: true })
    declare telegram: string | null;

    @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
    declare full_price: number;

    @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
    declare deposit: number;

    @Column({ type: DataType.DATEONLY, allowNull: false })
    declare booking_date: string;

    @Column({ type: DataType.DATEONLY, allowNull: false })
    declare pickup_date: string;

    @Column({ type: DataType.ENUM(...Object.values(BookingStatus)), allowNull: false, defaultValue: BookingStatus.BOOKED })
    declare status: BookingStatus;

    @Column({ type: DataType.JSON, allowNull: true })
    declare images: string[] | null;

    /** The Sale made when the customer picked it up. */
    @Column({ type: DataType.INTEGER, allowNull: true })
    declare sale_invoice_id: number | null;

    /** Did this booking take a laptop off the shelf (and so must give it back)? */
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    declare stock_held: boolean;

    /** [{ chat_id, ids: [message ids] }]: what was sent to Telegram, so it can be taken down when the laptop is sold. */
    @Column({ type: DataType.JSON, allowNull: true })
    declare telegram_messages: { chat_id: string; ids: number[] }[] | null;

    @BelongsTo(() => Product)
    declare product: Product | null;

    @CreatedAt declare created_at: Date;
    @UpdatedAt declare updated_at: Date;
}
