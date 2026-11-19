import 'reflect-metadata';
import { AutoIncrement, BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';
import { InvoiceType } from '../enums/invoice-type.enum';
import { Warranty } from '../enums/warranty.enum';
import Booking from './booking.model';
import Repair from './repair.model';

/** One line of the printed paper. */
export interface InvoiceItem { name: string; qty: number; unit_price: number }

/**
 * The printed paper of ONE sale, booking or repair. It keeps its own copy of everything printed on it (customer, items, prices),
 * so changing a product or a booking later never changes an invoice that was already given out.
 */
@Table({ tableName: 'invoices', createdAt: 'created_at', updatedAt: 'updated_at' })
export default class Invoice extends Model {
    @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
    declare id: number;

    @Column({ type: DataType.INTEGER, allowNull: false, unique: true })
    declare number: number;

    @Column({ type: DataType.ENUM(...Object.values(InvoiceType)), allowNull: false })
    declare type: InvoiceType;

    @Column({ type: DataType.DATEONLY, allowNull: false })
    declare invoice_date: string;

    @Column({ type: DataType.STRING(100), allowNull: true })
    declare customer_name: string | null;

    @Column({ type: DataType.STRING(20), allowNull: true })
    declare phone: string | null;

    @Column({ type: DataType.STRING(40), allowNull: true })
    declare telegram: string | null;

    @Column({ type: DataType.STRING(150), allowNull: true })
    declare device: string | null;

    @Column({ type: DataType.STRING(255), allowNull: true })
    declare problem: string | null;

    @Column({ type: DataType.DATEONLY, allowNull: true })
    declare pickup_date: string | null;

    @ForeignKey(() => Booking) @Column({ type: DataType.INTEGER, allowNull: true, unique: true })
    declare booking_id: number | null;

    @ForeignKey(() => Repair) @Column({ type: DataType.INTEGER, allowNull: true, unique: true })
    declare repair_id: number | null;

    @Column({ type: DataType.ENUM(...Object.values(Warranty)), allowNull: false, defaultValue: Warranty.NONE })
    declare warranty: Warranty;

    @Column({ type: DataType.JSON, allowNull: false })
    declare items: InvoiceItem[];

    @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
    declare total: number;

    @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
    declare deposit: number;

    @BelongsTo(() => Booking)
    declare booking: Booking | null;

    @BelongsTo(() => Repair)
    declare repair: Repair | null;

    @CreatedAt declare created_at: Date;
    @UpdatedAt declare updated_at: Date;
}
