// Safe, non-destructive seeder: only inserts the default categories that are missing.
// It never drops, truncates or overwrites anything.
//
// Your store sells two kinds of laptop:
//   Mac     -> brand is always Apple (filled in automatically)
//   Windows -> brand must be one of: Asus, Dell, HP, Acer, Surface
// These are only the STARTING brands. Add, rename and delete brands any time from the Products tab in the app.
require('dotenv').config();
const db = require('./src/config/database');

const categories = [
    { name: 'Mac',     description: 'Apple Mac laptops', brands: ['Apple'] },
    { name: 'Windows', description: 'Windows laptops',   brands: ['Asus', 'Dell', 'HP', 'Acer', 'Surface'] },
];

async function run() {
    try {
        let inserted = 0;
        for (const cat of categories) {
            const [result] = await db.query(
                'INSERT IGNORE INTO categories (name, description, brands) VALUES (?, ?, ?)',
                [cat.name, cat.description, JSON.stringify(cat.brands)]
            );
            inserted += result.affectedRows;
        }
        console.log(`Categories: ${inserted} inserted, ${categories.length - inserted} already existed.`);
    } catch (err) {
        console.error('Seeder error:', err.message);
        process.exit(1);
    } finally {
        await db.end();
    }
}

run();
