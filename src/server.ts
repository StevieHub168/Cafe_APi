import 'dotenv/config';
import app from './app';
import { sequelize } from './database/database';
import { ensureSchema } from './database/ensure-schema';

const PORT = process.env.PORT || 3000;

async function startServer(): Promise<void> {
    try {
        // Test database connection
        await sequelize.query('SELECT 1');
        console.log('✓ Database connected successfully');

        await ensureSchema();       // adds the tables / columns made after the first version (does nothing when they are there)

        // Start Express server
        app.listen(PORT, () => {
            console.log(`✓ Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        const failure = error as Error;
        console.error('✗ Failed to start server:');
        console.error('Error message:', failure.message);
        console.error('Error stack:', failure.stack);
        process.exit(1);
    }
}

void startServer();
