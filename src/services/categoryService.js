const Category = require('../models/Category');
const { removeImage } = require('../utils/uploads');

// Brand names: trimmed, 1-100 characters.
function cleanBrand(name) {
    const value = String(name ?? '').trim();
    if (!value) throw new Error('Brand name is required');
    if (value.length > 100) throw new Error('Brand name is too long (max 100 characters)');
    return value;
}

class CategoryService {
    static async getAllCategories() {
        return await Category.findAll();
    }

    static async getCategoryById(id) {
        const category = await Category.findById(id);
        if (!category) throw new Error('Category not found');
        return category;
    }

    static async createCategory(data) {
        const name = String(data.name || '').trim();
        if (!name) throw new Error('Category name is required');

        const existing = await Category.findByName(name);
        if (existing) throw new Error('Category already exists');

        const id = await Category.create({ name, description: data.description });
        return await Category.findById(id);
    }

    static async updateCategory(id, data) {
        const current = await Category.findById(id);
        if (!current) throw new Error('Category not found');

        const changes = {};
        if (data.name !== undefined) {
            const name = String(data.name).trim();
            if (!name) throw new Error('Category name is required');
            const existing = await Category.findByName(name);
            if (existing && Number(existing.id) !== Number(id)) throw new Error('Category already exists');
            changes.name = name;
        }
        if (data.description !== undefined) changes.description = data.description || null;

        await Category.update(id, changes);
        return await Category.findById(id);
    }

    static async deleteCategory(id) {
        const current = await Category.findById(id);
        if (!current) throw new Error('Category not found');

        const { deletedProducts, imageUrls } = await Category.deleteWithProducts(id);
        imageUrls.forEach(removeImage);
        const extra = deletedProducts > 0 ? ` and ${deletedProducts} product(s)` : '';
        return { message: `Category deleted${extra}`, deletedProducts };
    }

    static async addBrand(id, name) {
        await Category.addBrand(id, cleanBrand(name));
        return await Category.findById(id);
    }

    static async renameBrand(id, from, to) {
        await Category.renameBrand(id, cleanBrand(from), cleanBrand(to));
        return await Category.findById(id);
    }

    static async deleteBrand(id, name) {
        const { deletedProducts, imageUrls } = await Category.deleteBrand(id, cleanBrand(name));
        imageUrls.forEach(removeImage);
        const extra = deletedProducts > 0 ? ` and ${deletedProducts} product(s)` : '';
        return { message: `Brand deleted${extra}`, deletedProducts, category: await Category.findById(id) };
    }
}

module.exports = CategoryService;
