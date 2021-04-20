<template>
  <div>
    <span>Web RTC</span>
    <div class="bg-black" style="height: 200px; width: 300px"></div>
    <audio
      :srcObject="video.main.srcObject"
      :muted="video.main.muted"
      class="rounded-md"
      autoplay
      controls
    ></audio>
    <button class="py-2 px-3 bg-blue-700 rounded-md" @click="handleMute">
      Muted
    </button>
    <div v-for="(item, index) in video.remote" :key="index">
      <audio :srcObject="item.srcObject" controls autoplay></audio>
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
      peers: [], //peer-id, userphid, rtconnection(object)
      peer: {
        peer: "",
        userPHID: "",
        connection: null,
      },
      phidUser: "PHID-USER-gdhrsigm7vj22qqe5a47",
      position: "PHID-CONP-2c6ri7vqzn2vgg6eqzor",
      pc: null,
      ws: null
    };
  },
  mounted() {
    // initiate audio
    navigator.mediaDevices
      .getUserMedia(this.config)
      .then((res) => {
        this.video.main.srcObject = res;
        this.video.main.muted = true;
        res.getTracks().forEach((track) => {
          this.pc.addTrack(track, res);
        });
      })
      .catch((err) => {
        console.log(err);
        alert("cant open your webcam");
      });

    this.pc = new RTCPeerConnection(this.configuration);
    this.ws = new WebSocket(
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

    this.pc.ontrack = (event) => {
      console.log("on track", event)
      event.streams[0].getTracks().forEach((track) => {
        console.log("remote stream", track);
        const remoteStream = new MediaStream();
        remoteStream.addTrack(track);
        this.video.remote.push({
          muted: false,
          srcObject: remoteStream,
        });
      });
    };

    this.pc.onconnectionstatechange = () => {
      console.log("connection state", this.pc.connectionState);
    };

    this.ws.onopen = () => {
      // this.pc.onicecandidate = async (event) => {
      //   console.log(event);
      //   if (event.candidate) {
      //     const data = event.candidate;
      //     this.ws.send(
      //       JSON.stringify({
      //         candidate: data.candidate,
      //         id: data.sdpMid,
      //         label: data.sdpMLineIndex,
      //       })
      //     );
      //   }
      // };

      // first join page
      this.ws.send(
        JSON.stringify({
          event: "authenticate",
          data: {
            password: "tuuuuuurn",
            username: this.phidUser,
          },
        })
      );

      this.ws.onmessage = async (event) => {
        const { data } = event;
        const jsonData = JSON.parse(data);

        if (jsonData.data["peer_id"]) {
          if (jsonData.data["username"]) {
            const found =
              this.peers.findIndex(
                (data) => jsonData.data["peer_id"] === data
              ) === -1;
            if (found) {
              this.peers.push({
                peer: jsonData.data["peer_id"],
                userPHID: jsonData.data["username"],
              });
              console.log("new user joined");
            }
          } else {
            this.peer = {
              peer: jsonData.data["peer_id"],
              userPHID: this.phidUser,
            };
          }

          // make offer
          // if (jsonData["event"] === "joined") {
          console.log("make offer for ", jsonData.data["peer_id"]);
          const offerDescription = await this.pc.createOffer();
          await this.pc.setLocalDescription(offerDescription);

          const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
          };

          this.ws.send(
            JSON.stringify({
              event: "offer",
              to: jsonData.data["peer_id"],
              data: offer,
            })
          );
          // }
        }
        if (jsonData["event"]) {
          // answer
          if (jsonData["event"] === "offer") {
            console.log("make answer to peer", jsonData.from);
            const remoteDescription = new RTCSessionDescription(jsonData.data);
            await this.pc.setRemoteDescription(remoteDescription);

            const answerDescription = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answerDescription);
            const answer = {
              sdp: answerDescription.sdp,
              type: answerDescription.type,
            };
            this.ws.send(
              JSON.stringify({
                event: "answer",
                to: jsonData.from,
                data: answer,
              })
            );
          }

          // add ice candidate
          if (jsonData["event"] === "candidate") {
            const { data } = jsonData;
            const iceCandidate = {
              candidate: data.candidate,
              sdpMid: data.id,
              sdpMLineIndex: data.label,
            };
            await this.pc.addIceCandidate(new RTCIceCandidate(iceCandidate));
          }
        }
      };
    };
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
