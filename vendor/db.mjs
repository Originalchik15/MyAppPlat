// vendor/db.mjs

// ОДИН правильный импорт
import mysql from 'mysql2/promise';
import 'dotenv/config';

// Создаем пул соединений
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Функция для выполнения запросов
export async function query(sql, params) {
    try {
        const [rows, fields] = await pool.execute(sql, params);
        return rows;
    } catch (error) {
        // Добавим логирование ошибки, чтобы видеть проблемы с базой
        console.error("Database Query Error:", error);
        // Пробрасываем ошибку дальше, чтобы ее можно было поймать в роутах
        throw error;
    }
}