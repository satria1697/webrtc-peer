<template>
  <div>
    <span>Web RTC</span>
    <div class="bg-black" style="height: 200px; width: 300px"></div>
    <video
      :srcObject="video.main.srcObject"
      :muted="video.main.muted"
      class="rounded-md"
      autoplay
    ></video>
    <button class="py-2 px-3 bg-blue-700 rounded-md" @click="handleMute">
      Muted
    </button>
    <div v-for="(item, index) in video.remote" :key="index">
      <video :srcObject="item.srcObject" autoplay></video>
    </div>
  </div>
</template>

<script>
import SimplePeer from "simple-peer";

export default {
  data() {
    return {
      video: {
        main: {
          srcObject: null,
          muted: true,
        },
        remote: [],
      },
      peers: {},
      config: {
        audio: false,
        video: {
          width: {
            max: 600,
          },
          height: {
            max: 600,
          },
        },
      },
      configuration: {
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302",
          },
          // public turn server from https://gist.github.com/sagivo/3a4b2f2c7ac6e1b5267c2f1f59ac6c6b
          // set your own servers here
          {
            url: "turn:192.158.29.39:3478?transport=udp",
            credential: "JZEOEt2V3Qb0y27GRntt2u2PAYA=",
            username: "28224511:1379330808",
          },
        ],
      },
    };
  },
  sockets: {
    initReceive(socket_id) {
      console.log("INIT RECEIVE " + socket_id);
      this.addPeer(socket_id, false);

      this.$socket.emit("initSend", socket_id);
    },
    initSend(socket_id) {
      console.log("INIT SEND " + socket_id);
      this.addPeer(socket_id, true);
    },
    removePeer(socket_id) {
      console.log("removing peer " + socket_id);
      this.removePeer(socket_id);
    },
    disconnect() {
      console.log("GOT DISCONNECTED");
      for (let socket_id in this.peers) {
        this.removePeer(socket_id);
      }
    },
    signal(data) {
      this.peers[data.socket_id].signal(data.signal);
    },
  },
  mounted() {
    navigator.mediaDevices
      .getUserMedia(this.config)
      .then((res) => {
        this.video.main.srcObject = res;
        this.video.main.muted = true;
        console.log(res);
      })
      .catch((err) => {
        console.log(err);
        alert("cant open your webcam");
      });
  },
  methods: {
    handleMute() {
      this.video.main.muted = !this.video.main.muted;
    },
    removePeer(socket_id) {
      let videoEl = document.getElementById(socket_id);
      if (videoEl) {
        const tracks = videoEl.srcObject.getTracks();

        tracks.forEach(function (track) {
          track.stop();
        });

        videoEl.srcObject = null;
        videoEl.parentNode.removeChild(videoEl);
      }
      if (this.peers[socket_id]) this.peers[socket_id].destroy();
      delete this.peers[socket_id];
    },
    addPeer(socket_id, am_initiator) {
      this.peers[socket_id] = new SimplePeer({
        initiator: am_initiator,
        stream: this.video.main.srcObject,
        config: this.configuration,
      });

      this.peers[socket_id].on("signal", (data) => {
        this.$socket.emit("signal", {
          signal: data,
          socket_id: socket_id,
        });
      });

      this.peers[socket_id].on("stream", (stream) => {
        let newVid = document.createElement("video");
        newVid.srcObject = stream;
        newVid.id = socket_id;
        newVid.playsinline = false;
        newVid.autoplay = true;
        newVid.className = "vid";
        console.log(newVid.srcObject);
        this.video.remote.push({ srcObject: stream });
      });
    },
  },
};
</script>
