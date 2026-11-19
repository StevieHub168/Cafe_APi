import { Transaction, literal } from 'sequelize';
import { sequelize } from '../database/database';
import { conflict, notFound } from '../errors/app-error';
import Category from '../models/category.model';
import Product from '../models/product.model';
import { toList } from '../utils/json';
import { photosOf } from '../utils/uploads';

export interface CategoryRecord {
    id: number;
    name: string;
    description: string | null;
    /** The brands allowed in this category, or null (free-text brands). */
    brands: string[] | null;
    created_at: Date;
    updated_at: Date;
    /** How many products that are not archived (only when the category is listed or read). */
    product_count?: number;
}

const PRODUCT_COUNT = '(SELECT COUNT(*) FROM products p WHERE p.category_id = Category.id AND p.is_archived = 0)';
const WITH_COUNT = { include: [[literal(PRODUCT_COUNT), 'product_count'] as [ReturnType<typeof literal>, string]] };

// `brands` is a JSON array column (e.g. ["Asus","Dell"]). Always hand back a list with something in it, or null.
function withBrands<T extends { brands?: unknown }>(row: T | null | undefined): (T & { brands: string[] | null }) | undefined {
    if (!row) return undefined;
    const brands = toList<string>(row.brands);
    return { ...row, brands: brands && brands.length > 0 ? brands : null };
}

type BrandWork<T> = (transaction: Transaction, brands: string[]) => Promise<T>;

export class CategoryRepository {
    static async findAll(): Promise<CategoryRecord[]> {
        const rows = await Category.findAll({ attributes: WITH_COUNT, order: [['name', 'ASC']], raw: true });
        return rows.map(row => withBrands(row) as unknown as CategoryRecord);
    }

    static async findById(id: number | string): Promise<CategoryRecord | undefined> {
        const row = await Category.findOne({ where: { id }, attributes: WITH_COUNT, raw: true });
        return withBrands(row) as unknown as CategoryRecord | undefined;
    }

    static async findByName(name: string): Promise<CategoryRecord | undefined> {
        const row = await Category.findOne({ where: { name }, raw: true });
        return withBrands(row) as unknown as CategoryRecord | undefined;
    }

    static async create({ name, description }: { name: string; description?: string | null }): Promise<number> {
        const category = await Category.create({ name, description: description || null }, { validate: false });
        return category.id;
    }

    static async update(id: number | string, data: { name?: string; description?: string | null }): Promise<number> {
        const changes: { name?: string; description?: string | null } = {};
        if (data.name !== undefined) changes.name = data.name;
        if (data.description !== undefined) changes.description = data.description;
        if (Object.keys(changes).length === 0) return 0;
        const [affected] = await Category.update(changes, { where: { id }, validate: false });
        return affected;
    }

    // ---------- brands: stored as a JSON array in categories.brands ----------
    // Each method runs in one transaction on the locked category row, so two people editing at once can't clash.

    private static async withLockedCategory<T>(id: number | string, work: BrandWork<T>): Promise<T> {
        return sequelize.transaction(async (transaction) => {
            const row = await Category.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE, raw: true });
            const category = withBrands(row);
            if (!category) throw notFound('Category');
            return work(transaction, category.brands ?? []);
        });
    }

    static async addBrand(id: number | string, name: string): Promise<void> {
        await CategoryRepository.withLockedCategory(id, async (transaction, brands) => {
            if (brands.some(b => b.toLowerCase() === name.toLowerCase())) throw conflict('Brand already exists');
            await Category.update({ brands: [...brands, name] }, { where: { id }, transaction, validate: false });
        });
    }

    // Renames the brand in the list AND on every product that uses it.
    static async renameBrand(id: number | string, from: string, to: string): Promise<void> {
        await CategoryRepository.withLockedCategory(id, async (transaction, brands) => {
            const index = brands.findIndex(b => b.toLowerCase() === from.toLowerCase());
            if (index === -1) throw notFound('Brand');
            if (brands.some((b, i) => i !== index && b.toLowerCase() === to.toLowerCase())) throw conflict('Brand already exists');

            const next = [...brands];
            next[index] = to;
            await Product.update({ brand: to }, { where: { category_id: id, brand: brands[index] }, transaction, validate: false });
            await Category.update({ brands: next }, { where: { id }, transaction, validate: false });
        });
    }

    // Removes the brand from the list AND deletes every product of that brand.
    // If it was the last brand the list becomes empty (free-text brands).
    static async deleteBrand(id: number | string, name: string): Promise<{ deletedProducts: number; imageUrls: string[] }> {
        return CategoryRepository.withLockedCategory(id, async (transaction, brands) => {
            const index = brands.findIndex(b => b.toLowerCase() === name.toLowerCase());
            if (index === -1) throw notFound('Brand');
            const brand = brands[index];

            const images = await Product.findAll({ attributes: ['image_url', 'images'], where: { category_id: id, brand }, transaction, raw: true });
            const deletedProducts = await Product.destroy({ where: { category_id: id, brand }, transaction });

            const next = brands.filter((_, i) => i !== index);
            await Category.update({ brands: next.length ? next : null }, { where: { id }, transaction, validate: false });
            return { deletedProducts, imageUrls: images.flatMap(photosOf) };
        });
    }

    // Deletes the category AND every product in it (archived ones too) in one transaction.
    // All-or-nothing: on any error nothing is removed.
    static async deleteWithProducts(id: number | string): Promise<{ deleted: number; deletedProducts: number; imageUrls: string[] }> {
        return sequelize.transaction(async (transaction) => {
            const images = await Product.findAll({ attributes: ['image_url', 'images'], where: { category_id: id }, transaction, raw: true });
            const deletedProducts = await Product.destroy({ where: { category_id: id }, transaction });
            const deleted = await Category.destroy({ where: { id }, transaction });
            return { deleted, deletedProducts, imageUrls: images.flatMap(photosOf) };
        });
    }
}
