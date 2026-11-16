const db = require('../config/database');

class User {
    static async create(username, email, hashedPassword, fullName, role = 'staff', phone = null) {
        const [result] = await db.query(
            'INSERT INTO users (username, email, password, full_name, role, phone) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, fullName, role, phone]
        );
        return result.insertId;
    }

    static async findByEmail(email) {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0];
    }

    static async findByUsername(username) {
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await db.query(
            'SELECT id, username, email, full_name, role, phone, created_at FROM users WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    static async findAll() {
        const [rows] = await db.query(
            'SELECT id, username, email, full_name, role, phone, created_at FROM users ORDER BY created_at DESC'
        );
        return rows;
    }

    static async update(id, data) {
        const fields = [];
        const values = [];
        if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username); }
        if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
        if (data.full_name !== undefined) { fields.push('full_name = ?'); values.push(data.full_name); }
        if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
        if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }
        if (fields.length === 0) return 0;
        values.push(id);
        const [result] = await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
        return result.affectedRows;
    }

    static async delete(id) {
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
        return result.affectedRows;
    }

    static async saveAccessToken(userId, token) {
        await db.query('UPDATE users SET access_token = ? WHERE id = ?', [token, userId]);
    }

    static async findByAccessToken(token) {
        const [rows] = await db.query(
            'SELECT id, username, email, full_name, role, phone, created_at FROM users WHERE access_token = ?',
            [token]
        );
        return rows[0];
    }

    static async deleteAccessToken(userId) {
        await db.query('UPDATE users SET access_token = NULL WHERE id = ?', [userId]);
    }
}

module.exports = User;
