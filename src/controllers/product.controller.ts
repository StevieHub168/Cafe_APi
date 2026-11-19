import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { parsePageRequest } from '../utils/pagination';

// No try / catch here: an error thrown below goes to the error handler (middleware/error-handler.middleware.ts), which sends the right status.
export class ProductController {
    // GET /api/products?include_archived=true&category_id=2&brand=Dell&search=xps     every matching product
    // GET /api/products?page=1&per_page=20                                             one page (see utils/pagination.ts)
    static async getAllProducts(req: Request, res: Response): Promise<void> {
        const page = parsePageRequest(req.query);
        res.status(200).json(page ? await ProductService.getProductPage(req.query, page) : await ProductService.getAllProducts(req.query));
    }

    static async getProductById(req: Request, res: Response): Promise<void> {
        res.status(200).json(await ProductService.getProductById(String(req.params.id)));
    }

    // GET /api/products/by-code/LP-0042
    static async getProductByCode(req: Request, res: Response): Promise<void> {
        res.status(200).json(await ProductService.getProductByCode(String(req.params.code)));
    }

    static async createProduct(req: Request, res: Response): Promise<void> {
        res.status(201).json(await ProductService.createProduct(req.body));
    }

    static async updateProduct(req: Request, res: Response): Promise<void> {
        res.status(200).json(await ProductService.updateProduct(String(req.params.id), req.body));
    }

    static async deleteProduct(req: Request, res: Response): Promise<void> {
        res.status(200).json(await ProductService.deleteProduct(String(req.params.id)));
    }

    static async getLowStock(_req: Request, res: Response): Promise<void> {
        res.status(200).json(await ProductService.getLowStock());
    }
}
