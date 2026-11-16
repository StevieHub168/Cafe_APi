const CategoryService = require('../services/categoryService');

class CategoryController {
    static async getAllCategories(req, res) {
        try {
            const categories = await CategoryService.getAllCategories();
            res.status(200).json(categories);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getCategoryById(req, res) {
        try {
            const category = await CategoryService.getCategoryById(req.params.id);
            res.status(200).json(category);
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    static async createCategory(req, res) {
        try {
            const category = await CategoryService.createCategory(req.body);
            res.status(201).json(category);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateCategory(req, res) {
        try {
            const category = await CategoryService.updateCategory(req.params.id, req.body);
            res.status(200).json(category);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async deleteCategory(req, res) {
        try {
            const result = await CategoryService.deleteCategory(req.params.id);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // POST /api/categories/:id/brands            body: { name }
    static async addBrand(req, res) {
        try {
            const category = await CategoryService.addBrand(req.params.id, req.body?.name);
            res.status(201).json(category);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // PUT /api/categories/:id/brands/:name       body: { name }  (the new name)
    static async renameBrand(req, res) {
        try {
            const category = await CategoryService.renameBrand(req.params.id, req.params.name, req.body?.name);
            res.status(200).json(category);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /api/categories/:id/brands/:name    (also deletes that brand's products)
    static async deleteBrand(req, res) {
        try {
            const result = await CategoryService.deleteBrand(req.params.id, req.params.name);
            res.status(200).json(result);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = CategoryController;
