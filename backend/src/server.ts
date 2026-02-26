import { createApp } from "./app/app.js";

const app = createApp();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
