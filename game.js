const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('scoreDisplay');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreDisplay = document.getElementById('finalScore');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');

// High DPI Canvas setup
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial call

// Game State
let gameState = 'start'; // 'start', 'playing', 'gameover'
let score = 0;
let highestY = 0;
let lastTime = 0;
let cameraY = 0;

// Input state
let isPointerDown = false;

// Entities Arrays
let pegs = [];
let obstacles = [];
let particles = [];
let tail = [];
let gems = [];
let stars = [];

// Player Object
const player = {
    x: window.innerWidth / 2,
    y: window.innerHeight - 200,
    radius: 8,
    vx: 0,
    vy: -200, // Initial upward velocity much slower
    speed: 200,
    baseSpeed: 200,
    maxSpeed: 600,
    tethered: false,
    tetherPeg: null,
    angle: 0,
    color: '#00ffff',
    shield: 0 // Shield duration in seconds
};

// Main Game Loop
function gameLoop(timestamp) {
    // Calculate delta time in seconds
    let dt = (timestamp - lastTime) / 1000;
    if (isNaN(dt)) dt = 0;
    if (dt > 0.1) dt = 0.1; // Cap delta time to prevent large jumps if tab is inactive
    lastTime = timestamp;

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (gameState === 'playing') {
        update(dt);
    }

    // Always draw, even if paused/gameover, so the background remains visible
    draw();

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    updateObstacles(dt);

    // Basic placeholder movement for now to test loop
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Update camera to follow player upwards
    if (player.y < cameraY + window.innerHeight * 0.5) {
        cameraY = player.y - window.innerHeight * 0.5;
    }

    if (player.tethered && player.tetherPeg) {
        // Centripetal motion around the peg
        let dx = player.x - player.tetherPeg.x;
        let dy = player.y - player.tetherPeg.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        // Calculate angular velocity (omega = v / r)
        // We use the cross product to determine if it's clockwise or counter-clockwise
        let crossProduct = player.vx * dy - player.vy * dx;
        let direction = crossProduct > 0 ? 1 : -1; // 1 for CCW, -1 for CW (since y is down)

        let omega = (player.speed / dist) * direction;

        // Update angle based on omega
        let currentAngle = Math.atan2(dy, dx);
        let newAngle = currentAngle + omega * dt;

        // Calculate new position
        player.x = player.tetherPeg.x + Math.cos(newAngle) * dist;
        player.y = player.tetherPeg.y + Math.sin(newAngle) * dist;

        // Update velocity vector to be tangent to the circle
        player.vx = -Math.sin(newAngle) * player.speed * direction;
        player.vy = Math.cos(newAngle) * player.speed * direction;
    } else {
        // Linear movement
        player.x += player.vx * dt;
        player.y += player.vy * dt;

        // Wall bounce
        if (player.x - player.radius < 0) {
            player.x = player.radius;
            player.vx *= -1;
        } else if (player.x + player.radius > window.innerWidth) {
            player.x = window.innerWidth - player.radius;
            player.vx *= -1;
        }
    }

    // Update camera to follow player upwards
    if (player.y < cameraY + window.innerHeight * 0.6) {
        cameraY = player.y - window.innerHeight * 0.6;
    }

    // Update score and speed scaling based on height climbed (negative Y is up)
    let currentHeight = -(player.y - (window.innerHeight - 200));
    if (currentHeight > highestY) {
        highestY = currentHeight;
        score = Math.floor(highestY / 10);
        scoreDisplay.innerText = "Score: " + score;

        // Scale speed slowly as score goes up, cap at maxSpeed
        let targetSpeed = player.baseSpeed + (score * 0.5); // Add 5 speed per 10 score
        player.speed = Math.min(targetSpeed, player.maxSpeed);
    }

    // Particles and tail update
    if (Math.random() < 0.3) {
        spawnParticle(player.x, player.y, player.color);
    }

    tail.push({x: player.x, y: player.y, alpha: 1});
    if (tail.length > 20) tail.shift();
    for (let t of tail) {
        t.alpha -= dt * 2;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Procedural Generation
    generateEnvironment();

    // Check Collisions
    checkCollisions();

    // Shield decrement
    if (player.shield > 0) {
        player.shield -= dt;
    }

    // Cleanup off-screen entities (below camera)
    let cleanupY = cameraY + window.innerHeight + 200;
    pegs = pegs.filter(peg => peg.y < cleanupY);
    obstacles = obstacles.filter(obs => obs.y < cleanupY);
    gems = gems.filter(gem => gem.y < cleanupY);

    // Cycle stars for infinite effect
    for (let star of stars) {
        let screenY = star.y - cameraY * star.parallax;
        if (screenY > window.innerHeight) {
            star.y -= window.innerHeight * 1.5 / star.parallax;
        }
    }
}

// Storm logic
let stormSpeed = 100;
let stormYBase = 0;

function checkCollisions() {
    // Gem collection
    for (let i = gems.length - 1; i >= 0; i--) {
        let gem = gems[i];
        let dx = player.x - gem.x;
        let dy = player.y - gem.y;
        if (Math.sqrt(dx*dx + dy*dy) < player.radius + gem.radius + 15) {
            // Collect gem
            highestY += 500; // Bonus score
            player.shield = 5; // 5 seconds of invincibility
            gems.splice(i, 1);

            // Effect
            for(let j=0; j<10; j++) spawnParticle(gem.x, gem.y, gem.color);
        }
    }

    // Obstacle collision
    for (let obs of obstacles) {
        let dx = player.x - obs.x;
        let dy = player.y - obs.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < player.radius + obs.radius) {
            if (player.shield > 0) {
                // Destroy obstacle if shielded
                obstacles.splice(obstacles.indexOf(obs), 1);
                for(let j=0; j<15; j++) spawnParticle(obs.x, obs.y, obs.color);
                highestY += 200;
            } else {
                triggerGameOver();
                return;
            }
        }
    }

    // Death storm collision logic
    // Storm rises slowly based on time, but snaps to bottom of camera if camera moves up quickly
    let cameraBottom = cameraY + window.innerHeight;

    // Move storm upwards automatically over time
    stormYBase -= stormSpeed * (1/60); // approximate dt

    // If player leaves storm far behind, pull it up to camera bottom edge minus some buffer
    if (stormYBase > cameraBottom + 200) {
        stormYBase = cameraBottom + 200;
    }

    // The visual storm line
    let actualStormY = Math.min(cameraBottom, stormYBase);

    if (player.y > actualStormY) {
        triggerGameOver();
        return;
    }
}

function triggerGameOver() {
    gameState = 'gameover';

    // Spawn explosion particles
    for (let i = 0; i < 30; i++) {
        spawnParticle(player.x, player.y, player.color);
    }

    // UI Update
    finalScoreDisplay.innerText = "Final Score: " + score;
    gameOverScreen.style.display = 'block';
}

function spawnParticle(x, y, color) {
    particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 100,
        vy: (Math.random() - 0.5) * 100,
        radius: Math.random() * 3 + 1,
        color: color,
        life: Math.random() * 0.5 + 0.2
    });
}

// Procedural Generation
let lastGenY = 0; // The Y coordinate where we last generated elements

function generateEnvironment() {
    // Generate up to 1 screen ahead of the camera
    let targetGenY = cameraY - window.innerHeight;

    while (lastGenY > targetGenY) {
        // Step size for generation
        let step = Math.random() * 150 + 100;
        lastGenY -= step;

        // Decide what to spawn
        if (Math.random() < 0.8) {
            spawnPeg(lastGenY);
        }
        if (Math.random() < 0.5) {
            spawnObstacle(lastGenY);
        }
        if (Math.random() < 0.15) { // 15% chance for a gem
            spawnGem(lastGenY - 50);
        }
    }
}

function initStars() {
    stars = [];
    for (let i = 0; i < 100; i++) {
        stars.push({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight * 2 - window.innerHeight,
            size: Math.random() * 2 + 0.5,
            parallax: Math.random() * 0.5 + 0.1, // Slower moving = further away
            alpha: Math.random() * 0.5 + 0.3
        });
    }
}

function spawnPeg(y) {
    let x = Math.random() * (window.innerWidth - 100) + 50;

    // Some pegs orbit a central point
    let isOrbiting = Math.random() < 0.3;

    pegs.push({
        x: x,
        y: y,
        baseX: x,
        baseY: y,
        radius: 12,
        active: false,
        color: '#ffffff',
        isOrbiting: isOrbiting,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitRadius: isOrbiting ? Math.random() * 40 + 20 : 0,
        orbitSpeed: (Math.random() < 0.5 ? 1 : -1) * (Math.random() * 2 + 1)
    });
}

function spawnGem(y) {
    gems.push({
        x: Math.random() * (window.innerWidth - 60) + 30,
        y: y,
        radius: 10,
        color: '#ffdd00', // Gold/yellow
        angle: 0
    });
}

function spawnObstacle(y) {
    let x = Math.random() * (window.innerWidth - 60) + 30;
    let radius = Math.random() * 20 + 15;

    // Simple movement for obstacles (horizontal ping-pong)
    let isMoving = Math.random() < 0.5;
    let speed = isMoving ? (Math.random() * 100 + 50) : 0;
    let direction = Math.random() < 0.5 ? 1 : -1;

    obstacles.push({
        x: x,
        y: y,
        radius: radius,
        color: '#ff0055',
        isMoving: isMoving,
        speed: speed,
        direction: direction,
        minX: Math.max(radius, x - 100),
        maxX: Math.min(window.innerWidth - radius, x + 100)
    });
}

function updateObstacles(dt) {
    for (let obs of obstacles) {
        if (obs.isMoving) {
            obs.x += obs.speed * obs.direction * dt;
            if (obs.x < obs.minX) {
                obs.x = obs.minX;
                obs.direction *= -1;
            } else if (obs.x > obs.maxX) {
                obs.x = obs.maxX;
                obs.direction *= -1;
            }
        }
    }

    // Update orbiting pegs
    for (let peg of pegs) {
        if (peg.isOrbiting) {
            peg.orbitAngle += peg.orbitSpeed * dt;
            peg.x = peg.baseX + Math.cos(peg.orbitAngle) * peg.orbitRadius;
            peg.y = peg.baseY + Math.sin(peg.orbitAngle) * peg.orbitRadius;
        }
    }

    // Animate gems
    for (let gem of gems) {
        gem.angle += 3 * dt;
    }
}

function tryTether() {
    if (gameState !== 'playing') return;

    // Find closest peg
    let closestPeg = null;
    let closestDist = Infinity;

    for (let peg of pegs) {
        let dx = player.x - peg.x;
        let dy = player.y - peg.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < closestDist && dist < peg.radius + 150) { // Max tether range
            closestDist = dist;
            closestPeg = peg;
        }
    }

    if (closestPeg) {
        player.tethered = true;
        player.tetherPeg = closestPeg;
        closestPeg.active = true;
    }
}

function untether() {
    if (player.tethered) {
        player.tethered = false;
        if (player.tetherPeg) {
            player.tetherPeg.active = false;
            player.tetherPeg = null;
        }
    }
}

function draw() {
    // Draw Parallax Stars (Not affected by full camera translation)
    ctx.shadowBlur = 0;
    for (let star of stars) {
        ctx.beginPath();
        let starY = star.y - cameraY * star.parallax; // Parallax effect
        ctx.arc(star.x, starY, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fill();
    }

    ctx.save();
    // Apply camera translation
    ctx.translate(0, -cameraY);

    // Performance Optimization: Less intense shadow blurs for mobile lag
    // Only apply heavy shadow blur to the player and active pegs

    // Draw Gems
    ctx.shadowBlur = 10;
    for (let gem of gems) {
        ctx.save();
        ctx.translate(gem.x, gem.y);
        ctx.rotate(gem.angle);
        ctx.beginPath();
        ctx.moveTo(0, -gem.radius);
        ctx.lineTo(gem.radius, 0);
        ctx.lineTo(0, gem.radius);
        ctx.lineTo(-gem.radius, 0);
        ctx.closePath();
        ctx.fillStyle = gem.color;
        ctx.shadowColor = gem.color;
        ctx.fill();
        ctx.restore();
    }

    // Draw Tail (No shadow blur to save performance)
    ctx.shadowBlur = 0;
    ctx.beginPath();
    if (tail.length > 0) {
        ctx.moveTo(tail[0].x, tail[0].y);
        for (let i = 1; i < tail.length; i++) {
            ctx.lineTo(tail[i].x, tail[i].y);
        }
        ctx.strokeStyle = `rgba(0, 255, 255, ${Math.max(0, tail[tail.length-1].alpha)})`;
        ctx.lineWidth = player.radius;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#00ffff';
        ctx.stroke();
    }

    // Draw Particles (Minimal shadow)
    ctx.shadowBlur = 0;
    for (let p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
        ctx.fill();
    }

    // Draw Death Storm
    let cameraBottom = cameraY + window.innerHeight;
    let actualStormY = Math.min(cameraBottom, stormYBase);

    let stormGradient = ctx.createLinearGradient(0, actualStormY - 100, 0, actualStormY);
    stormGradient.addColorStop(0, 'rgba(255, 0, 85, 0)');
    stormGradient.addColorStop(1, 'rgba(255, 0, 85, 0.4)');

    ctx.fillStyle = stormGradient;
    ctx.fillRect(0, actualStormY - 100, window.innerWidth, cameraBottom - (actualStormY - 100));

    // Draw Pegs (Glow only if active)
    for (let peg of pegs) {
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
        ctx.fillStyle = peg.active ? '#00ffff' : peg.color;

        if (peg.active) {
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }
        ctx.fill();

        // Draw tether line if active
        if (peg.active && player.tethered) {
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(peg.x, peg.y);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 5;
            ctx.stroke();
        }
    }

    // Draw Obstacles (reduced shadow)
    ctx.shadowBlur = 5;
    for (let obs of obstacles) {
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
        ctx.fillStyle = obs.color;
        ctx.shadowColor = obs.color;
        ctx.fill();
    }

    // Draw Player (only if alive)
    if (gameState === 'playing' || gameState === 'start') {
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);

        // Visual indicator for shield
        if (player.shield > 0) {
            ctx.fillStyle = '#ffdd00';
            ctx.shadowColor = '#ffdd00';
        } else {
            ctx.fillStyle = '#ffffff'; // White core
            ctx.shadowColor = player.color;
        }

        ctx.shadowBlur = 20;
        ctx.fill();

        if (player.shield > 0) {
            // Draw shield bubble
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.radius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 221, 0, ${0.5 + Math.sin(performance.now()/100)*0.3})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    ctx.restore();
}

function initGame() {
    player.x = window.innerWidth / 2;
    player.y = window.innerHeight - 200;
    player.speed = player.baseSpeed;
    player.vx = 0;
    player.vy = -player.speed;
    player.tethered = false;
    player.tetherPeg = null;

    cameraY = 0;
    stormYBase = window.innerHeight + 400; // Start storm far below
    score = 0;
    highestY = 0;
    scoreDisplay.innerText = "Score: 0";

    pegs = [];
    obstacles = [];
    particles = [];
    tail = [];
    gems = [];

    initStars();

    lastGenY = window.innerHeight - 400; // Start generating a bit above the player

    // Initial static pegs to start
    spawnPeg(window.innerHeight - 400);
    pegs[0].isOrbiting = false; // Ensure first is easy
    spawnPeg(window.innerHeight - 600);
    pegs[1].isOrbiting = false;

    lastTime = performance.now();
    gameState = 'playing';
}

// Input Listeners
window.addEventListener('mousedown', (e) => {
    // Only tether if clicking on canvas, not UI
    if (e.target === canvas) {
        isPointerDown = true;
        tryTether();
    }
});

window.addEventListener('mouseup', () => {
    isPointerDown = false;
    untether();
});

window.addEventListener('touchstart', (e) => {
    if (e.target === canvas) {
        isPointerDown = true;
        tryTether();
    }
}, {passive: false});

window.addEventListener('touchend', () => {
    isPointerDown = false;
    untether();
});

// UI Listeners
startButton.addEventListener('click', () => {
    startScreen.style.display = 'none';
    initGame();
});

restartButton.addEventListener('click', () => {
    gameOverScreen.style.display = 'none';
    initGame();
});

// Start loop
requestAnimationFrame(gameLoop);
