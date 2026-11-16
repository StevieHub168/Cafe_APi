const ProductService = require('../services/productService');

class ProductController {
    static async getAllProducts(req, res) {
        try {
            const includeArchived = req.query.include_archived === 'true';
            const products = await ProductService.getAllProducts(includeArchived);
            res.status(200).json(products);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getProductById(req, res) {
        try {
            const product = await ProductService.getProductById(req.params.id);
            res.status(200).json(product);
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    // GET /api/products/by-code/LP-0042
    static async getProductByCode(req, res) {
        try {
            res.status(200).json(await ProductService.getProductByCode(req.params.code));
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    static async createProduct(req, res) {
        try {
            const product = await ProductService.createProduct(req.body);
            res.status(201).json(product);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async updateProduct(req, res) {
        try {
            const product = await ProductService.updateProduct(req.params.id, req.body);
            res.status(200).json(product);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }

    static async deleteProduct(req, res) {
        try {
            const result = await ProductService.deleteProduct(req.params.id);
            res.status(200).json(result);
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    }

    static async getLowStock(req, res) {
        try {
            const products = await ProductService.getLowStock();
            res.status(200).json(products);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = ProductController;
