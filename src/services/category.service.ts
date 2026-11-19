import { badRequest, conflict, notFound } from '../errors/app-error';
import { CategoryRecord, CategoryRepository } from '../repositories/category.repository';
import { Body } from '../utils/types';
import { removeImage } from '../utils/uploads';

// Brand names: trimmed, 1-100 characters.
function cleanBrand(name: unknown): string {
    const value = String(name ?? '').trim();
    if (!value) throw badRequest('Brand name is required');
    if (value.length > 100) throw badRequest('Brand name is too long (max 100 characters)');
    return value;
}

export class CategoryService {
    static async getAllCategories(): Promise<CategoryRecord[]> {
        return await CategoryRepository.findAll();
    }

    static async getCategoryById(id: string): Promise<CategoryRecord> {
        const category = await CategoryRepository.findById(id);
        if (!category) throw notFound('Category');
        return category;
    }

    static async createCategory(data: Body): Promise<CategoryRecord | undefined> {
        const name = String(data.name || '').trim();
        if (!name) throw badRequest('Category name is required');

        const existing = await CategoryRepository.findByName(name);
        if (existing) throw conflict('Category already exists');

        const id = await CategoryRepository.create({ name, description: data.description });
        return await CategoryRepository.findById(id);
    }

    static async updateCategory(id: string, data: Body): Promise<CategoryRecord | undefined> {
        const current = await CategoryRepository.findById(id);
        if (!current) throw notFound('Category');

        const changes: { name?: string; description?: string | null } = {};
        if (data.name !== undefined) {
            const name = String(data.name).trim();
            if (!name) throw badRequest('Category name is required');
            const existing = await CategoryRepository.findByName(name);
            if (existing && Number(existing.id) !== Number(id)) throw conflict('Category already exists');
            changes.name = name;
        }
        if (data.description !== undefined) changes.description = data.description || null;

        await CategoryRepository.update(id, changes);
        return await CategoryRepository.findById(id);
    }

    static async deleteCategory(id: string): Promise<{ message: string; deletedProducts: number }> {
        const current = await CategoryRepository.findById(id);
        if (!current) throw notFound('Category');

        const { deletedProducts, imageUrls } = await CategoryRepository.deleteWithProducts(id);
        imageUrls.forEach(removeImage);
        const extra = deletedProducts > 0 ? ` and ${deletedProducts} product(s)` : '';
        return { message: `Category deleted${extra}`, deletedProducts };
    }

    static async addBrand(id: string, name: unknown): Promise<CategoryRecord | undefined> {
        await CategoryRepository.addBrand(id, cleanBrand(name));
        return await CategoryRepository.findById(id);
    }

    static async renameBrand(id: string, from: unknown, to: unknown): Promise<CategoryRecord | undefined> {
        await CategoryRepository.renameBrand(id, cleanBrand(from), cleanBrand(to));
        return await CategoryRepository.findById(id);
    }

    static async deleteBrand(id: string, name: unknown): Promise<{ message: string; deletedProducts: number; category: CategoryRecord | undefined }> {
        const { deletedProducts, imageUrls } = await CategoryRepository.deleteBrand(id, cleanBrand(name));
        imageUrls.forEach(removeImage);
        const extra = deletedProducts > 0 ? ` and ${deletedProducts} product(s)` : '';
        return { message: `Brand deleted${extra}`, deletedProducts, category: await CategoryRepository.findById(id) };
    }
}
