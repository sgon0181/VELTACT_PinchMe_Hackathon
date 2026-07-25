import { app } from "./app.js";
import { env } from "./env.js";

app.listen(env.PORT, () => {
  console.log(`Veltact API listening on http://localhost:${env.PORT}`);
});
