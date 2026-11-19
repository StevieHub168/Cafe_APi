// Safe, non-destructive seeder: only inserts the default categories that are missing.
// It never drops, truncates or overwrites anything.
//
// Your store sells two kinds of laptop:
//   Mac     -> brand is always Apple (filled in automatically)
//   Windows -> brand must be one of: Asus, Dell, HP, Acer, Surface
// These are only the STARTING brands. Add, rename and delete brands any time from the Products tab in the app.
import 'dotenv/config';
import { sequelize } from './database';
import Category from '../models/category.model';

const categories = [
    { name: 'Mac',     description: 'Apple Mac laptops', brands: ['Apple'] },
    { name: 'Windows', description: 'Windows laptops',   brands: ['Asus', 'Dell', 'HP', 'Acer', 'Surface'] },
];

async function run(): Promise<void> {
    try {
        let inserted = 0;
        for (const category of categories) {
            const [, created] = await Category.findOrCreate({ where: { name: category.name }, defaults: category as never });
            if (created) inserted++;
        }
        console.log(`Categories: ${inserted} inserted, ${categories.length - inserted} already existed.`);
    } catch (err) {
        console.error('Seeder error:', (err as Error).message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

void run();
