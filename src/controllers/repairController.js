const RepairService = require('../services/repairService');

// A mistake in what was typed is a 400; a repair that does not exist is a 404.
const fail = (res, error) => res.status(error.statusCode || 400).json({ error: error.message });

class RepairController {
    static async getAllRepairs(req, res) {
        try {
            res.status(200).json(await RepairService.getAllRepairs(req.query.status));
        } catch (error) {
            fail(res, error);
        }
    }

    static async getRepairById(req, res) {
        try {
            res.status(200).json(await RepairService.getRepairById(req.params.id));
        } catch (error) {
            fail(res, error);
        }
    }

    static async createRepair(req, res) {
        try {
            res.status(201).json(await RepairService.createRepair(req.body));
        } catch (error) {
            fail(res, error);
        }
    }

    static async updateRepair(req, res) {
        try {
            res.status(200).json(await RepairService.updateRepair(req.params.id, req.body));
        } catch (error) {
            fail(res, error);
        }
    }

    static async deleteRepair(req, res) {
        try {
            res.status(200).json(await RepairService.deleteRepair(req.params.id));
        } catch (error) {
            fail(res, error);
        }
    }
}

module.exports = RepairController;
