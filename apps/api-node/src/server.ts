import app from './app';
import { connectDB, disconnectDB } from './db/connection';
import http from 'http';

const PORT = process.env.PORT || 4000;
let server: http.Server;

const startServer = async () => {
  await connectDB();
  
  server = app.listen(PORT, () => {
    console.log(`Node API server listening on port ${PORT}`);
  });
};

const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  if (server) {
    server.close(() => {
      console.log('HTTP server closed.');
    });
  }
  
  await disconnectDB();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();
