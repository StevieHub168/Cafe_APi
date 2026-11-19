import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import { sequelizeConfig } from '../config/sequelize.config';
import Booking from '../models/booking.model';
import Category from '../models/category.model';
import Invoice from '../models/invoice.model';
import Product from '../models/product.model';
import Repair from '../models/repair.model';
import User from '../models/user.model';

/** The one connection to the database. Every model is registered here. */
export const sequelize = new Sequelize({
    ...sequelizeConfig(),
    models: [User, Category, Product, Booking, Repair, Invoice]
});
