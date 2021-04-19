import { createApp } from "vue";
import App from "./App.vue";
// import socketio from "socket.io-client";
// import VueSocketIO from "vue-socket.io";

createApp(App)
  // .use(
  //   new VueSocketIO({
  //     debug: true,
  //     connection: socketio("http://localhost:3000"),
  //   })
  // )
  .mount("#app");
