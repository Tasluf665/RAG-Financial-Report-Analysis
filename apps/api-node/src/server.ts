import app from './app';
import { connectDB } from './db/connection';

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`Node API server listening on port ${PORT}`);
  });
};

startServer();
