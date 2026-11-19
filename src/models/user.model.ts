import 'reflect-metadata';
import { AutoIncrement, Column, CreatedAt, DataType, Model, PrimaryKey, Table, UpdatedAt } from 'sequelize-typescript';
import { Role } from '../enums/role.enum';

/** A person who can sign in. `access_token` is the one token that works for them now (signing out, or in again elsewhere, replaces it). */
@Table({ tableName: 'users', createdAt: 'created_at', updatedAt: 'updated_at' })
export default class User extends Model {
    @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
    declare id: number;

    @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
    declare username: string;

    @Column({ type: DataType.STRING(100), allowNull: false, unique: true })
    declare email: string;

    @Column({ type: DataType.STRING(255), allowNull: false })
    declare password: string;

    @Column({ type: DataType.STRING(100), allowNull: false })
    declare full_name: string;

    @Column({ type: DataType.ENUM(...Object.values(Role)), allowNull: false, defaultValue: Role.STAFF })
    declare role: Role;

    @Column({ type: DataType.STRING(20), allowNull: true })
    declare phone: string | null;

    @Column({ type: DataType.STRING(500), allowNull: true })
    declare access_token: string | null;

    @CreatedAt declare created_at: Date;
    @UpdatedAt declare updated_at: Date;
}
