<template>
  <div>
    <span>Web RTC</span>
    <div class="bg-black" style="height: 200px; width: 300px"></div>
    <audio
      :srcObject="audioSource.main.srcObject"
      :muted="audioSource.main.muted"
      class="rounded-md"
      autoplay
      controls
    ></audio>
    <button class="py-2 px-3 bg-blue-700 rounded-md" @click="handleMute">
      Muted
    </button>
    <div v-for="(item, index) in audioSource.remote" :key="index">
      <audio :srcObject="item.srcObject" controls autoplay></audio>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      audioSource: {
        main: {
          srcObject: null,
          muted: true,
        },
        remote: [],
      },
      config: {
        audio: true,
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
      phidUser: "PHID-USER-lqsz5sgxnwwroo3ndorj",
      position: "PHID-CONP-2c6ri7vqzn2vgg6eqzor",
      pc: null,
      ws: null,
    };
  },
  mounted() {
    navigator.mediaDevices
      .getUserMedia(this.config)
      .then((res) => {
        this.audioSource.main.srcObject = res;
        this.audioSource.main.muted = true;
      })
      .catch((err) => {
        console.log(err);
        alert("cant open your webcam");
      });
    this.connectSocket();
    // connect to phab dashboard
    // const wsDashboard = new WebSocket("wss://dashboard.refactory.id:22280/");
    // wsDashboard.onopen = () => {
    //   wsDashboard.send(
    //     JSON.stringify({
    //       command: "subscribe",
    //       data: [this.phidUser, this.position, 'lobby'],
    //     })
    //   );
    // };
  },
  methods: {
    initRTC(peerId, peerPHID, isInitiator) {
      console.log("Create connection for ", peerId);
      const pc = new RTCPeerConnection(this.configuration);
      pc.onicecandidate = this.handleIceCandidate(peerId);
      pc.ontrack = this.handleRemoteStream(peerId);
      pc.addStream(this.audioSource.main.srcObject);
      this.peers[peerId] = { pc };
      this.peers[peerId].state = "connected";
      this.peers[peerId].phid = peerPHID;
      if (peerPHID === this.phidUser) {
        this.peer = pc;
        this.currentPeer = peerId;
      }
      if (isInitiator) {
        this.createOffer(peerId);
      }
    },
    handleIceCandidate(peerId) {
      return (event) => {
        if (event.candidate) {
          const iceCandidate = event.candidate;
          const data = {
            candidate: iceCandidate.candidate,
            id: iceCandidate.sdpMid,
            label: iceCandidate.sdpMLineIndex,
          };
          this.ws.send(
            JSON.stringify({
              data: data,
              event: "candidate",
              to: peerId,
            })
          );
        }
      };
    },
    handleRemoteStream(payload) {
      return (event) => {
        event.streams[0].getTracks().forEach((track) => {
          console.log("remote stream", track);
          const remoteStream = new MediaStream();
          remoteStream.addTrack(track);
          this.audioSource.remote.push({
            muted: false,
            srcObject: remoteStream,
            peer: payload,
          });
        });
      };
    },
    async createOffer(peerId) {
      const pc = this.peers[peerId].pc;
      const sessionDescription = await pc.createOffer();
      await pc.setLocalDescription(sessionDescription);
      this.ws.send(
        JSON.stringify({
          event: "offer",
          to: peerId,
          data: sessionDescription,
        })
      );
    },
    async handleOffer(payload) {
      this.initRTC(payload.from, null, false);
      const pc = this.peers[payload.from].pc;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
      const sessionDescription = await pc.createAnswer();
      await pc.setLocalDescription(sessionDescription);
      this.ws.send(
        JSON.stringify({
          event: "answer",
          data: sessionDescription,
          to: payload.from,
        })
      );
    },
    handleCandidate(payload) {
      const candidate = new RTCIceCandidate({
        sdpMLineIndex: payload.data.label,
        candidate: payload.data.candidate,
      });
      this.peers[payload.from].pc.addIceCandidate(candidate);
    },
    handleAnswer(payload) {
      this.peers[payload.from].pc.setRemoteDescription(
        new RTCSessionDescription(payload.data)
      );
    },
    handleLeave(payload) {
      if (this.peers[payload["peer_id"]]) {
        this.peers[payload["peer_id"]].state = "connecting";
        if (this.peers[payload["peer_id"]].pc) {
          this.peers[payload["peer_id"]].pc.close();
        }
        const idx = this.peers.findIndex(
          (data) => data.peer === payload["peer_id"]
        );
        this.peers.slice(idx, 1);
        delete this.peers[payload["peer_id"]];
      }
    },
    connectSocket() {
      this.ws = new WebSocket(
        `wss://ice.suiteapp.id:8443/websocket/suite-${this.position}`
      );
      this.ws.onopen = () => {
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

        this.ws.onmessage = (event) => {
          const { data } = event;
          const jsonData = JSON.parse(data);
          if (jsonData.data["peer_id"]) {
            this.peer.peer = jsonData.data["peer_id"];
            this.initRTC(this.peer.peer, this.phidUser, true);
          }
          if (jsonData["event"] === "offer") {
            this.handleOffer(jsonData);
          }
          if (jsonData["event"] === "candidate") {
            this.handleCandidate(jsonData);
          }
          if (jsonData["event"] === "answer") {
            this.handleAnswer(jsonData);
          }
          if (jsonData["event"] === "leave") {
            this.handleLeave(jsonData);
          }
        };
      };
      this.ws.onclose = () => this.connectSocket();
    },
  },
};
</script>
