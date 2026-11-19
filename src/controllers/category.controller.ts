import { Request, Response } from 'express';
import { CategoryService } from '../services/category.service';

// No try / catch here: an error thrown below goes to the error handler (middleware/error-handler.middleware.ts), which sends the right status.
export class CategoryController {
    static async getAllCategories(_req: Request, res: Response): Promise<void> {
        res.status(200).json(await CategoryService.getAllCategories());
    }

    static async getCategoryById(req: Request, res: Response): Promise<void> {
        res.status(200).json(await CategoryService.getCategoryById(String(req.params.id)));
    }

    static async createCategory(req: Request, res: Response): Promise<void> {
        res.status(201).json(await CategoryService.createCategory(req.body));
    }

    static async updateCategory(req: Request, res: Response): Promise<void> {
        res.status(200).json(await CategoryService.updateCategory(String(req.params.id), req.body));
    }

    static async deleteCategory(req: Request, res: Response): Promise<void> {
        res.status(200).json(await CategoryService.deleteCategory(String(req.params.id)));
    }

    // POST /api/categories/:id/brands            body: { name }
    static async addBrand(req: Request, res: Response): Promise<void> {
        res.status(201).json(await CategoryService.addBrand(String(req.params.id), req.body?.name));
    }

    // PUT /api/categories/:id/brands/:name       body: { name }  (the new name)
    static async renameBrand(req: Request, res: Response): Promise<void> {
        res.status(200).json(await CategoryService.renameBrand(String(req.params.id), req.params.name, req.body?.name));
    }

    // DELETE /api/categories/:id/brands/:name    (also deletes that brand's products)
    static async deleteBrand(req: Request, res: Response): Promise<void> {
        res.status(200).json(await CategoryService.deleteBrand(String(req.params.id), req.params.name));
    }
}
