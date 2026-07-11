const reportService = require('../services/reportService');

async function getDashboard(req, res) {
    try {
        const dashboard = await reportService.getDashboard(req.query.days);
        res.json(dashboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getSummary(req, res) {
    try {
        const summary = await reportService.getSummary();
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getSalesTrend(req, res) {
    try {
        const trend = await reportService.getSalesTrend(req.query.days);
        res.json(trend);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getTopItems(req, res) {
    try {
        const items = await reportService.getTopItems(req.query.limit);
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getCategorySales(req, res) {
    try {
        const categories = await reportService.getCategorySales();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getPaymentMethods(req, res) {
    try {
        const methods = await reportService.getPaymentMethods();
        res.json(methods);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getCashierPerformance(req, res) {
    try {
        const cashiers = await reportService.getCashierPerformance(req.query.limit);
        res.json(cashiers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getDashboard,
    getSummary,
    getSalesTrend,
    getTopItems,
    getCategorySales,
    getPaymentMethods,
    getCashierPerformance
};
