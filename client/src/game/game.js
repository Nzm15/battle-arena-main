"use-strict"

import Phaser from "phaser";
import playerImage from "./../assets/player.png"
import npc1 from "./../assets/npc2.png"; //NPC
import outdoor from "./../assets/tilemaps/battle-royale1.json";
import outdoorImage from "./../assets/tilemaps/battle-royale.png";
import bulletImage from "./../assets/bullet.png";
import cursorImage from "./../assets/cursor.cur";
import bulletSound from "./../assets/sound/bulletSound.mp3";
import backgroundMusic1 from "./../assets/sound/backgroundMusic1.mp3";
import backgroundMusic2 from "./../assets/sound/backgroundMusic2.mp3";
import * as Colyseus from "colyseus.js";

var gameConfig = require('./../../config.json');

const endpoint = (window.location.hostname === "localhost") ? `ws://localhost:${gameConfig.serverDevPort}` : `${window.location.protocol.replace("http", "ws")}//${window.location.hostname}:${gameConfig.serverDevPort}`


/*for heroku remote deployment...to run it locally comment the code below and uncomment the code at the top
const endpoint = (window.location.protocol === "http:") ? `ws://${gameConfig.herokuRemoteUrl}` : `wss://${gameConfig.herokuRemoteUrl}`*/

var client = new Colyseus.Client(endpoint);


export default class Game extends Phaser.Scene {
    constructor() {
        super("Game");

    }

    init() {
        this.room = null;
        this.roomJoined = false;
        this.cursors = null;
        this.players = {};
        this.player = null;
        this.bullets = {};
        this.score = 0;
        this.map;
        this.bulletSound = null;
        this.backgroundMusic = null;
        this.npc = null;
        this.interactKey = null;
        this.interactText = null;
        this.isNearNPC = false;
        this.closingMessage = "You have been disconnected from the server";

    }

    preload() {
        this.load.audio('bulletSound', bulletSound);
        this.load.audio('backgroundMusic', [backgroundMusic1, backgroundMusic2]);
        this.load.image("tiles", outdoorImage);
        this.load.tilemapTiledJSON("map", outdoor);
        this.load.image('player', playerImage);
        this.load.image('bullet', bulletImage);
        this.load.image('npc',npc1);//npc 
    }

    create() {

        this.backgroundMusic = this.sound.add('backgroundMusic');
        this.backgroundMusic.setLoop(true).play();

        this.bulletSound = this.sound.add('bulletSound');

        this.input.setDefaultCursor(`url('${cursorImage}'), crosshair`);
        this.map = this.make.tilemap({
            key: "map"
        });


        const tileset = this.map.addTilesetImage("battle-royale", "tiles");
        const floorLayer = this.map.createStaticLayer("floor", tileset, 0, 0);
        //const herbeLayer = this.map.createStaticLayer("herbe", tileset, 0, 0);
        this.map["blockLayer"] = this.map.createStaticLayer("block", tileset, 0, 0);
        //this.map["wallLayer"] = this.map.createStaticLayer("wall", tileset, 0, 0);
        this.map["blockLayer"].setCollisionByProperty({
            collide: true
        });


        this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
        this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

        this.connect();

        this.scoreText = this.add.text(16, 16, "numbers of kills : " + this.score, {
            font: "18px monospace",
            fill: "#FFFFFF",
            padding: {
                x: 20,
                y: 10
            },
        }).setScrollFactor(0).setDepth(10);

        // Replace the cursors creation with WASD keys
        this.cursors = {
            up: this.input.keyboard.addKey('W'),
            down: this.input.keyboard.addKey('S'),
            left: this.input.keyboard.addKey('A'),
            right: this.input.keyboard.addKey('D')
        };

        // this.anims.create({
        //     key: 'NPCLeft',
        //     frames: this.anims.generateFrameNames('npc', {
        //         prefix: 'skeleton-walk-left/',
        //         suffix: '',
        //         start: 1,
        //         end: 3,
        //         zeroPad: 2
        //     }),
        //     frameRate: 10,
        //     repeat: -1
        // });

        this.npc = this.physics.add.sprite(280, 200, 'npc');
        this.npc.setImmovable(true);

        this.interactKey = this.input.keyboard.addKey('E');
        
        // Add interaction text (hidden by default)
        this.interactText = this.add.text(0, 0, 'Press E to interact', {
            font: "16px monospace",
            fill: "#ffffff"
        });
        this.interactText.setVisible(false);
        this.interactText.setScrollFactor(0);
        
    }

    connect() {
        var self = this;
        this.room = client.join("outdoor", {});


        this.room.onJoin.add(() => {

            self.roomJoined = true;

            this.room.onStateChange.addOnce((state) => {
                // Loop over all the player data received
                for (let id in state.players) {
                    // If the player hasn't been created yet
                    if (self.players[id] == undefined && id != this.room.sessionId) { // Make sure you don't create yourself
                        let data = state.players[id];
                        self.addPlayer({
                            id: id,
                            x: data.x,
                            y: data.y,
                            rotation: data.rotation || 0
                        });
                        let player_sprite = self.players[id].sprite;
                        player_sprite.target_x = state.players[id].x; // Update target, not actual position, so we can interpolate
                        player_sprite.target_y = state.players[id].y;
                        player_sprite.target_rotation = (state.players[id].rotation || 0);
                    }

                }
            });

            this.room.state.players.onAdd = (player, sessionId) => {
                //to prevent the player from recieving a message when he is the new player added
                if (sessionId != this.room.sessionId) {
                    // If you want to track changes on a child object inside a map, this is a common pattern:
                    player.onChange = function (changes) {
                        changes.forEach(change => {
                            if (change.field == "rotation") {
                                self.players[sessionId].sprite.target_rotation = change.value;
                            } else if (change.field == "x") {
                                self.players[sessionId].sprite.target_x = change.value;
                            } else if (change.field == "y") {
                                self.players[sessionId].sprite.target_y = change.value;
                            }
                        });
                    };

                }
            }

            this.room.state.bullets.onAdd = (bullet, sessionId) => {
                self.bullets[bullet.index] = self.physics.add.sprite(bullet.x, bullet.y, 'bullet').setRotation(bullet.angle);

                // If you want to track changes on a child object inside a map, this is a common pattern:
                bullet.onChange = function (changes) {
                    changes.forEach(change => {
                        if (change.field == "x") {
                            self.bullets[bullet.index].x = change.value;
                        } else if (change.field == "y") {
                            self.bullets[bullet.index].y = change.value;
                        }
                    });
                };

            }

            this.room.state.bullets.onRemove = function (bullet, sessionId) {
                self.removeBullet(bullet.index);
            }



            this.room.state.players.onRemove = function (player, sessionId) {
                //if the player removed (maybe killed) is not this player
                if (sessionId !== self.room.sessionId) {
                    self.removePlayer(sessionId);
                }
            }
        });

        this.room.onMessage.add((message) => {
            if (message.event == "start_position") {
                let spawnPoint = this.map.findObject("player", obj => obj.name === `player${message.position}`);
                let position = {
                    x: spawnPoint.x,
                    y: spawnPoint.y
                }
                this.room.send({
                    action: "initial_position",
                    data: position
                });
                self.addPlayer({
                    id: this.room.sessionId,
                    x: spawnPoint.x,
                    y: spawnPoint.y
                });
            } else if (message.event == "new_player") {
                let spawnPoint = this.map.findObject("player", obj => obj.name === `player${message.position}`);
                let p = self.addPlayer({
                    x: spawnPoint.x,
                    y: spawnPoint.y,
                    id: message.id,
                    rotation: message.rotation || 0
                });
            } else if (message.event == "hit") {
                if (message.punisher_id == self.room.sessionId) {
                    self.score += 1;
                    self.scoreText.setText("numbers of kills : " + self.score);
                } else if (message.punished_id == self.room.sessionId) {
                    self.closingMessage = "You have been killed.\nTo restart, reload the page";
                    this.player.sprite.destroy();
                    delete this.player;
                    alert(self.closingMessage);
                    client.close();
                    //maybe implement the possibility to the see the game after being killed
                }
            } else {
                console.log(`${message.event} is an unkown event`);
            }
        });

        this.room.onError.add(() => {
            alert(room.sessionId + " couldn't join " + room.name);
        });



    }

    update() {

        for (let id in this.players) {
            let p = this.players[id].sprite;
            p.x += ((p.target_x || p.x) - p.x) * 0.5;
            p.y += ((p.target_y || p.x) - p.y) * 0.5;
            // Intepolate angle while avoiding the positive/negative issue 
            let angle = p.target_rotation || p.rotation;
            let dir = (angle - p.rotation) / (Math.PI * 2);
            dir -= Math.round(dir);
            dir = dir * Math.PI * 2;
            p.rotation += dir;
        }

        if (this.player) {
            this.player.sprite.setVelocity(0);

            const distance = Phaser.Math.Distance.Between(
                this.player.sprite.x, this.player.sprite.y,
                this.npc.x, this.npc.y
            );

            if (distance < 100) {
                if (!this.isNearNPC) {
                    this.isNearNPC = true;
                    this.interactText.setVisible(true);
                }
                
                if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
                    this.showDialog([
                        "Hello There!!!",
                        "I heard you want to challenge me in the Mathematics quiz.",
                        "For your information, I've never been defeated.",
                        "GOODLUCK!!!"
                    ]);
                }
            } else if (this.isNearNPC) {
                this.isNearNPC = false;
                this.interactText.setVisible(false);
            }

            if (this.cursors.left.isDown) {
                this.rotatePlayer();
                this.player.sprite.setVelocityX(-300);
            } else if (this.cursors.right.isDown) {
                this.rotatePlayer();
                this.player.sprite.setVelocityX(300);
            }

            if (this.cursors.up.isDown) {
                this.rotatePlayer();
                this.player.sprite.setVelocityY(-300);
            } else if (this.cursors.down.isDown) {
                this.rotatePlayer();
                this.player.sprite.setVelocityY(300);
            }

            this.input.on('pointermove', function (pointer) {
                this.rotatePlayer(pointer);
            }, this);

            this.input.on('pointerdown', function (pointer) {
                if (!this.shot) {
                    this.bulletSound.play();

                    let speed_x = Math.cos(this.player.sprite.rotation + Math.PI / 2) * 50;
                    let speed_y = Math.sin(this.player.sprite.rotation + Math.PI / 2) * 50;

                    // Tell the server we shot a bullet 
                    this.room.send({
                        action: "shoot_bullet",
                        data: {
                            x: this.player.sprite.x,
                            y: this.player.sprite.y,
                            angle: this.player.sprite.rotation,
                            speed_x: speed_x,
                            speed_y: speed_y
                        }
                    });

                    this.shot = true;

                }
            }, this);

            this.shot = false;

            if (this.roomJoined) {
                this.room.send({
                    action: "move",
                    data: {
                        x: this.player.sprite.x,
                        y: this.player.sprite.y,
                        rotation: this.player.sprite.rotation
                    }
                });
            }
        }

    }

    showDialog(messages) {
        const dialogBox = this.add.graphics();
        dialogBox.fillStyle(0x000000, 0.7);
        dialogBox.fillRect(50, 400, 700, 150);
        
        const dialogText = this.add.text(70, 420, messages[0], {
            font: "18px monospace",
            fill: "#ffffff",
            wordWrap: { width: 660 }
        });
        dialogText.setScrollFactor(0);
        
        let messageIndex = 0;
        const closeDialog = () => {
            dialogBox.destroy();
            dialogText.destroy();
            this.input.keyboard.off('keydown-SPACE', handleNextMessage);
        };
        
        const handleNextMessage = () => {
            messageIndex++;
            if (messageIndex < messages.length) {
                dialogText.setText(messages[messageIndex]);
            } else {
                closeDialog();
            }
        };
        
        this.input.keyboard.on('keydown-SPACE', handleNextMessage);
    }

    addPlayer(data) {
        let id = data.id;
        let sprite = this.physics.add.sprite(data.x, data.y, "player").setSize(60, 80);

        if (id == this.room.sessionId) {
            this.player = {};
            this.player.sprite = sprite;
            this.player.sprite.setCollideWorldBounds(true);
            this.cameras.main.startFollow(this.player.sprite);
            this.physics.add.collider(this.player.sprite, this.map["blockLayer"]);

        } else {
            this.players[id] = {};
            this.players[id].sprite = sprite;
            this.players[id].sprite.setTint("0xff0000");
            this.players[id].sprite.setRotation(data.rotation);
        }
    }

    removePlayer(id) {
        this.players[id].sprite.destroy();
        delete this.players[id];
    }

    rotatePlayer(pointer = this.input.activePointer) {
        let player = this.player.sprite;
        let angle = Phaser.Math.Angle.Between(player.x, player.y, pointer.x + this.cameras.main.scrollX, pointer.y + this.cameras.main.scrollY)
        player.setRotation(angle + Math.PI / 2);
    }

    removeBullet(index) {
        this.bullets[index].destroy();
        delete this.bullets[index];
    }

}