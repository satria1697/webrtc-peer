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
      <p>{{ index }}</p>
      <p>{{ item.srcObject }}</p>
      <p>{{ video.remote }}</p>
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
      config: {
        audio: true,
        // video: {
        //   width: {
        //     max: 600,
        //   },
        //   height: {
        //     max: 600,
        //   },
        // },
      },
      configuration: {
        iceServers: [
          {
            urls: "stun:ice.suiteapp.id:3478",
          },
        ],
      },
      peers: [],
      peer: "",
      phidUser: "PHID-USER-l6a2gknezsmy6oewxiqf",
      position: "PHID-CONP-6k2gyhstfqjs6pidgdpq",
    };
  },
  created() {
    const pc = new RTCPeerConnection(this.configuration);
    const ws = new WebSocket(
      `wss://ice.suiteapp.id:8443/websocket/suite-${this.position}`
    );
    const wsDashboard = new WebSocket("wss://dashboard.refactory.id:22280/");

    wsDashboard.onopen = () => {
      wsDashboard.send(
        JSON.stringify({
          command: "subscribe",
          data: [this.phidUser, this.position],
        })
      );
    };

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        const remoteStream = new MediaStream();
        remoteStream.addTrack(track);
        this.video.remote.push({
          muted: false,
          srcObject: remoteStream,
        });
      });
    };

    pc.onconnectionstatechange = () => {
      console.log("connection state", pc.connectionState);
    };

    pc.onicecandidate = (event) => {
      console.log("onicecandidate", event);
      if (event.candidate) {
        const iceCandidate = event.candidate;
        this.peers.forEach((data) => {
          const candidate = new RTCIceCandidate(iceCandidate);
          ws.send(
            JSON.stringify({
              to: data,
              event: "candidate",
              data: {
                id: candidate.sdpMid,
                label: candidate.sdpMLineIndex,
                candidate: candidate.candidate,
              },
            })
          );
        });
      }
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          event: "authenticate",
          data: {
            password: "tuuuuuurn",
            username: this.phidUser,
          },
        })
      );
      ws.onmessage = async (event) => {
        const { data } = event;
        const jsonData = JSON.parse(data);
        if (jsonData.data["peer_id"]) {
          const found =
            this.peers.findIndex(
              (data) => jsonData.data["peer_id"] === data
            ) === -1;
          if (found) {
            this.peers.push(jsonData.data["peer_id"]);
          }

          // if (jsonData["event"] === "joined") {
          const offerDescription = await pc.createOffer();
          await pc.setLocalDescription(offerDescription);

          const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
          };

          this.peers.forEach((peer) => {
            ws.send(
              JSON.stringify({
                event: "offer",
                to: peer,
                data: offer,
              })
            );
          });
          // }
        }
        if (jsonData["event"]) {
          // offer
          if (jsonData["event"] === "offer") {
            if (this.peers.findIndex((data) => jsonData.from === data) === -1)
              this.peers.push(jsonData.from);

            console.log("connection state", pc.connectionState);
            const remoteDescription = new RTCSessionDescription(jsonData.data);
            await pc.setRemoteDescription(remoteDescription);

            const answerDescription = await pc.createAnswer();
            await pc.setLocalDescription(answerDescription);
            this.peers.forEach((data) => {
              const answer = {
                sdp: answerDescription.sdp,
                type: answerDescription.type,
              };
              ws.send(
                JSON.stringify({
                  event: "answer",
                  to: data,
                  data: answer,
                })
              );
            });
          }

          // candidate
          if (jsonData["event"] === "candidate") {
            if (this.peers.findIndex((data) => jsonData.from === data) === -1)
              this.peers.push(jsonData.from);

            const { data } = jsonData;
            const iceCandidate = {
              candidate: data.candidate,
              sdpMid: data.id,
              sdpMLineIndex: data.label,
            };
            await pc.addIceCandidate(new RTCIceCandidate(iceCandidate));
          }
          if (jsonData["event"] === "joined") {
            console.log("user joined");
            this.peers.push(jsonData.data["peer_id"]);
          }
        }
      };
    };
  },
  mounted() {
    navigator.mediaDevices
      .getUserMedia(this.config)
      .then((res) => {
        this.video.main.srcObject = res;
        this.video.main.muted = true;
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
