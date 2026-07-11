const Report = require('../models/Report');

async function getDashboard(days) {
    return Report.getDashboard(days);
}

async function getSummary() {
    return Report.getSummary();
}

async function getSalesTrend(days) {
    return Report.getSalesTrend(days);
}

async function getTopItems(limit) {
    return Report.getTopItems(limit);
}

async function getCategorySales() {
    return Report.getCategorySales();
}

async function getPaymentMethods() {
    return Report.getPaymentMethodBreakdown();
}

async function getCashierPerformance(limit) {
    return Report.getCashierPerformance(limit);
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
