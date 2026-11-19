import 'reflect-metadata';
import { AutoIncrement, BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';
import { RepairStatus } from '../enums/repair-status.enum';
import Product from './product.model';

/** A repair job: a laptop (the shop's or a customer's) in the shop, with 3 steps: received -> fixed -> picked up. */
@Table({ tableName: 'repairs', createdAt: 'created_at', updatedAt: 'updated_at' })
export default class Repair extends Model {
    @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
    declare id: number;

    @ForeignKey(() => Product) @Column({ type: DataType.INTEGER, allowNull: true })
    declare product_id: number | null;

    @Column({ type: DataType.STRING(80), allowNull: false })
    declare device: string;

    @Column({ type: DataType.STRING(100), allowNull: true })
    declare customer_name: string | null;

    @Column({ type: DataType.STRING(20), allowNull: true })
    declare phone: string | null;

    @Column({ type: DataType.STRING(40), allowNull: true })
    declare telegram: string | null;

    @Column({ type: DataType.STRING(140), allowNull: false })
    declare problem: string;

    @Column({ type: DataType.DATEONLY, allowNull: false })
    declare received_date: string;

    @Column({ type: DataType.DATEONLY, allowNull: true })
    declare back_on: string | null;

    @Column({ type: DataType.DECIMAL(12, 2), allowNull: true })
    declare cost: number | null;

    @Column({ type: DataType.ENUM(...Object.values(RepairStatus)), allowNull: false, defaultValue: RepairStatus.RECEIVED })
    declare status: RepairStatus;

    @Column({ type: DataType.DATEONLY, allowNull: true })
    declare fixed_date: string | null;

    @Column({ type: DataType.DATEONLY, allowNull: true })
    declare picked_up_date: string | null;

    /** The Sale of this laptop, when the shop sold it. */
    @Column({ type: DataType.INTEGER, allowNull: true })
    declare sale_invoice_id: number | null;

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    declare stock_held: boolean;

    @Column({ type: DataType.JSON, allowNull: true })
    declare images: string[] | null;

    @BelongsTo(() => Product)
    declare product: Product | null;

    @CreatedAt declare created_at: Date;
    @UpdatedAt declare updated_at: Date;
}
