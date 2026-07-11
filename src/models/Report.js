const db = require('../config/database');
const Order = require('./Order');

class Report {
    static async getSuccessCondition() {
        const { orderColumns } = await Order.getSchema();

        if (orderColumns.has('payment_status')) {
            return "o.payment_status = 'SUCCESS'";
        }
        if (orderColumns.has('status')) {
            return "o.status = 'COMPLETED'";
        }
        return '1=1';
    }

    static async getCashierSelection() {
        const { orderColumns } = await Order.getSchema();

        if (orderColumns.has('cashier_name')) {
            return { field: 'o.cashier_name', joinClause: '' };
        }
        if (orderColumns.has('cashier_id')) {
            return {
                field: "u.username",
                joinClause: ' LEFT JOIN users u ON u.id = o.cashier_id'
            };
        }
        return { field: "'Unknown'", joinClause: '' };
    }

    static async getSummary() {
        const successCondition = await this.getSuccessCondition();

        const [[totals]] = await db.query(
            `SELECT
                COUNT(*) AS totalOrders,
                COALESCE(SUM(o.total), 0) AS totalRevenue
             FROM orders o
             WHERE ${successCondition}`
        );

        const [[itemsSold]] = await db.query(
            `SELECT COALESCE(SUM(oi.quantity), 0) AS totalItemsSold
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE ${successCondition}`
        );

        const [[today]] = await db.query(
            `SELECT
                COUNT(*) AS todayOrders,
                COALESCE(SUM(o.total), 0) AS todayRevenue
             FROM orders o
             WHERE ${successCondition} AND DATE(o.created_at) = CURDATE()`
        );

        const totalOrders = Number(totals.totalOrders) || 0;
        const totalRevenue = Number(totals.totalRevenue) || 0;

        return {
            totalOrders,
            totalRevenue,
            totalItemsSold: Number(itemsSold.totalItemsSold) || 0,
            averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            todayOrders: Number(today.todayOrders) || 0,
            todayRevenue: Number(today.todayRevenue) || 0
        };
    }

    static async getSalesTrend(days = 14) {
        const successCondition = await this.getSuccessCondition();
        const numDays = Math.min(Math.max(Number(days) || 14, 1), 365);

        const [rows] = await db.query(
            `SELECT
                DATE(o.created_at) AS date,
                COUNT(*) AS orders,
                COALESCE(SUM(o.total), 0) AS revenue
             FROM orders o
             WHERE ${successCondition} AND o.created_at >= (CURDATE() - INTERVAL ? DAY)
             GROUP BY DATE(o.created_at)
             ORDER BY date ASC`,
            [numDays - 1]
        );

        const byDate = new Map(
            rows.map(row => [
                new Date(row.date).toISOString().slice(0, 10),
                { orders: Number(row.orders), revenue: Number(row.revenue) }
            ])
        );

        const trend = [];
        for (let i = numDays - 1; i >= 0; i--) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const entry = byDate.get(key);
            trend.push({
                date: key,
                orders: entry ? entry.orders : 0,
                revenue: entry ? entry.revenue : 0
            });
        }

        return trend;
    }

    static async getTopItems(limit = 8) {
        const successCondition = await this.getSuccessCondition();
        const numLimit = Math.min(Math.max(Number(limit) || 8, 1), 50);

        const [rows] = await db.query(
            `SELECT
                oi.item_name AS itemName,
                COALESCE(SUM(oi.quantity), 0) AS quantity,
                COALESCE(SUM(oi.subtotal), 0) AS revenue
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             WHERE ${successCondition}
             GROUP BY oi.item_name
             ORDER BY revenue DESC
             LIMIT ?`,
            [numLimit]
        );

        return rows.map(row => ({
            itemName: row.itemName,
            quantity: Number(row.quantity),
            revenue: Number(row.revenue)
        }));
    }

    static async getCategorySales() {
        const successCondition = await this.getSuccessCondition();

        const [rows] = await db.query(
            `SELECT
                COALESCE(c.name, 'Uncategorized') AS category,
                COALESCE(SUM(oi.quantity), 0) AS quantity,
                COALESCE(SUM(oi.subtotal), 0) AS revenue
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
             LEFT JOIN items i ON i.id = oi.item_id
             LEFT JOIN categories c ON c.id = i.category_id
             WHERE ${successCondition}
             GROUP BY category
             ORDER BY revenue DESC`
        );

        return rows.map(row => ({
            category: row.category,
            quantity: Number(row.quantity),
            revenue: Number(row.revenue)
        }));
    }

    static async getPaymentMethodBreakdown() {
        const { orderColumns } = await Order.getSchema();
        if (!orderColumns.has('payment_method')) {
            return [];
        }

        const successCondition = await this.getSuccessCondition();
        const [rows] = await db.query(
            `SELECT
                COALESCE(o.payment_method, 'UNKNOWN') AS paymentMethod,
                COUNT(*) AS orders,
                COALESCE(SUM(o.total), 0) AS revenue
             FROM orders o
             WHERE ${successCondition}
             GROUP BY o.payment_method
             ORDER BY revenue DESC`
        );

        return rows.map(row => ({
            paymentMethod: row.paymentMethod,
            orders: Number(row.orders),
            revenue: Number(row.revenue)
        }));
    }

    static async getCashierPerformance(limit = 10) {
        const successCondition = await this.getSuccessCondition();
        const { field, joinClause } = await this.getCashierSelection();
        const numLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

        const [rows] = await db.query(
            `SELECT
                COALESCE(${field}, 'Unknown') AS cashier,
                COUNT(*) AS orders,
                COALESCE(SUM(o.total), 0) AS revenue
             FROM orders o${joinClause}
             WHERE ${successCondition}
             GROUP BY cashier
             ORDER BY revenue DESC
             LIMIT ?`,
            [numLimit]
        );

        return rows.map(row => ({
            cashier: row.cashier,
            orders: Number(row.orders),
            revenue: Number(row.revenue)
        }));
    }

    static async getDashboard(days = 14) {
        const [summary, salesTrend, topItems, categorySales, paymentMethods, cashierPerformance] = await Promise.all([
            this.getSummary(),
            this.getSalesTrend(days),
            this.getTopItems(8),
            this.getCategorySales(),
            this.getPaymentMethodBreakdown(),
            this.getCashierPerformance(10)
        ]);

        return { summary, salesTrend, topItems, categorySales, paymentMethods, cashierPerformance };
    }
}

module.exports = Report;
