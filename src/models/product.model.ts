import 'reflect-metadata';
import { AutoIncrement, BelongsTo, Column, CreatedAt, DataType, ForeignKey, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';
import { HoldStatus } from '../enums/hold-status.enum';
import Category from './category.model';

/** A laptop the shop sells. A single laptop (track_stock off) is sold once; counted stock has a quantity. */
@Table({ tableName: 'products', createdAt: 'created_at', updatedAt: 'updated_at' })
export default class Product extends Model {
    @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
    declare id: number;

    @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
    declare sku: string;

    /** The short code on the QR label ("LP-0042"), made from the id. */
    @Column({ type: DataType.STRING(12), allowNull: true, unique: true })
    declare code: string | null;

    @Column({ type: DataType.STRING(150), allowNull: false })
    declare name: string;

    @ForeignKey(() => Category) @Column({ type: DataType.INTEGER, allowNull: false })
    declare category_id: number;

    @Column({ type: DataType.STRING(100), allowNull: true })
    declare brand: string | null;

    @Column({ type: DataType.STRING(100), allowNull: true })
    declare model: string | null;

    @Column({ type: DataType.TEXT, allowNull: true })
    declare description: string | null;

    @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, defaultValue: 0 })
    declare selling_price: number;

    @Column({ type: DataType.JSON, allowNull: true })
    declare extra_prices: { label: string; price: number }[] | null;

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    declare track_stock: boolean;

    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    declare stock_quantity: number;

    @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
    declare min_stock_level: number;

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    declare is_archived: boolean;

    @Column({ type: DataType.ENUM(...Object.values(HoldStatus)), allowNull: true })
    declare hold_status: HoldStatus | null;

    /** The cover photo (= the first one of `images`). */
    @Column({ type: DataType.STRING(500), allowNull: true })
    declare image_url: string | null;

    @Column({ type: DataType.JSON, allowNull: true })
    declare images: string[] | null;

    @BelongsTo(() => Category)
    declare category: Category;

    @CreatedAt declare created_at: Date;
    @UpdatedAt declare updated_at: Date;
}
