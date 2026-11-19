import 'reflect-metadata';
import { AutoIncrement, Column, CreatedAt, DataType, HasMany, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';
import Product from './product.model';

/** Mac / Windows. `brands` is a JSON list of the brands allowed in it (e.g. ["Asus", "Dell"]). */
@Table({ tableName: 'categories', createdAt: 'created_at', updatedAt: 'updated_at' })
export default class Category extends Model {
    @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
    declare id: number;

    @Column({ type: DataType.STRING(100), allowNull: false, unique: true })
    declare name: string;

    @Column({ type: DataType.STRING(255), allowNull: true })
    declare description: string | null;

    @Column({ type: DataType.JSON, allowNull: true })
    declare brands: string[] | null;

    @HasMany(() => Product)
    declare products: Product[];

    @CreatedAt declare created_at: Date;
    @UpdatedAt declare updated_at: Date;
}
