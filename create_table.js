const { Client } = require('pg');

const connectionString = 'postgresql://postgres:postgres@postgres:5432/vb2';

const client = new Client({
  connectionString,
});

async function createTable() {
  try {
    await client.connect();
    console.log(`Connected successfully to ${connectionString}`);

    const query = `
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(10) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        quantity DECIMAL(10, 4) NOT NULL,
        type VARCHAR(4) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await client.query(query);
    console.log('Table "trades" created successfully in the vb2 database!');
  } catch (error) {
    console.error('Failed to create table:', error.message);
  } finally {
    await client.end();
  }
}

createTable();
