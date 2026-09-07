import { createApp } from "./app";

const port = Number(process.env.PORT || 4000);
createApp().listen(port, () => {
  console.info(`API listening on http://localhost:${port}`);
});
