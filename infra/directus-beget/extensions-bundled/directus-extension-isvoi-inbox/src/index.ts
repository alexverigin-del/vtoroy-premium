import { defineModule } from "@directus/extensions-sdk";
import Inbox from "./inbox.vue";
export default defineModule({
  id: "isvoi-inbox",
  name: "Коммуникации",
  icon: "forum",
  routes: [{ path: "", component: Inbox }],
});
