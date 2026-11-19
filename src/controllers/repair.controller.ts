import { Request, Response } from 'express';
import { RepairService } from '../services/repair.service';
import { parsePageRequest } from '../utils/pagination';

// No try / catch here: an error thrown below goes to the error handler (middleware/error-handler.middleware.ts), which sends the right status
// (a mistake in what was typed is a 400, a repair that does not exist is a 404).
export class RepairController {
    // GET /api/repairs?status=fixed&search=dell        every matching repair
    // GET /api/repairs?page=1&per_page=20              one page (see utils/pagination.ts)
    static async getAllRepairs(req: Request, res: Response): Promise<void> {
        const page = parsePageRequest(req.query);
        res.status(200).json(page ? await RepairService.getRepairPage(req.query, page) : await RepairService.getAllRepairs(req.query));
    }

    static async getRepairById(req: Request, res: Response): Promise<void> {
        res.status(200).json(await RepairService.getRepairById(String(req.params.id)));
    }

    static async createRepair(req: Request, res: Response): Promise<void> {
        res.status(201).json(await RepairService.createRepair(req.body));
    }

    static async updateRepair(req: Request, res: Response): Promise<void> {
        res.status(200).json(await RepairService.updateRepair(String(req.params.id), req.body));
    }

    static async deleteRepair(req: Request, res: Response): Promise<void> {
        res.status(200).json(await RepairService.deleteRepair(String(req.params.id)));
    }
}
