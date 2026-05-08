export class ProceduralSpriteService {
    static generateSprite(faction, shipType, size = 128) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.translate(size / 2, size / 2);
        
        // Faction Colors
        const primaryColor = faction === 'Solaris' ? '#00f2ff' : '#d400ff';
        const secondaryColor = faction === 'Solaris' ? '#0066ff' : '#7700ff';
        const glowColor = faction === 'Solaris' ? 'rgba(0, 242, 255, 0.5)' : 'rgba(212, 0, 255, 0.5)';
        
        if (faction === 'Solaris') {
            this._drawSolarisShip(ctx, shipType, size, primaryColor, secondaryColor, glowColor);
        } else {
            this._drawSyndicateShip(ctx, shipType, size, primaryColor, secondaryColor, glowColor);
        }
        
        ctx.restore();
        return canvas;
    }

    static _drawSolarisShip(ctx, type, size, pColor, sColor, gColor) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = pColor;
        
        const grad = ctx.createLinearGradient(-size/4, -size/4, size/4, size/4);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, pColor);
        grad.addColorStop(1, sColor);
        
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;

        ctx.beginPath();
        switch (type) {
            case 'Fighter':
                ctx.moveTo(0, -size/3);
                ctx.lineTo(size/4, size/4);
                ctx.lineTo(0, size/8);
                ctx.lineTo(-size/4, size/4);
                break;
            case 'Scout':
                ctx.moveTo(0, -size/3);
                ctx.lineTo(size/6, 0);
                ctx.lineTo(size/4, size/3);
                ctx.lineTo(0, size/6);
                ctx.lineTo(-size/4, size/3);
                ctx.lineTo(-size/6, 0);
                break;
            case 'TroopTransport':
                ctx.moveTo(-size/6, -size/3);
                ctx.lineTo(size/6, -size/3);
                ctx.lineTo(size/4, size/3);
                ctx.lineTo(-size/4, size/3);
                break;
            case 'Salvager':
                ctx.moveTo(0, -size/3);
                ctx.lineTo(size/5, -size/6);
                ctx.lineTo(size/5, size/4);
                ctx.lineTo(-size/5, size/4);
                ctx.lineTo(-size/5, -size/6);
                // "Arms"
                ctx.moveTo(size/5, 0); ctx.lineTo(size/3, -size/8);
                ctx.moveTo(-size/5, 0); ctx.lineTo(-size/3, -size/8);
                break;
            case 'Frigate':
                ctx.moveTo(0, -size/2.5);
                ctx.lineTo(size/8, -size/4);
                ctx.lineTo(size/3, size/4);
                ctx.lineTo(0, size/10);
                ctx.lineTo(-size/3, size/4);
                ctx.lineTo(-size/8, -size/4);
                break;
            case 'SpaceStation':
                for (let i = 0; i < 8; i++) {
                    ctx.rotate(Math.PI / 4);
                    ctx.fillRect(-size/10, -size/2.2, size/5, size/4);
                }
                ctx.beginPath();
                ctx.arc(0, 0, size/4, 0, Math.PI * 2);
                break;
            default:
                ctx.moveTo(0, -size/4);
                ctx.lineTo(size/4, size/4);
                ctx.lineTo(-size/4, size/4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Add "Windows" / Lights
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#ffffff';
        if (type !== 'SpaceStation') {
            ctx.beginPath();
            ctx.arc(0, -size/10, size/20, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    static _drawSyndicateShip(ctx, type, size, pColor, sColor, gColor) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = pColor;
        
        const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, size/2);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, pColor);
        grad.addColorStop(1, '#1a002a');
        
        ctx.fillStyle = grad;
        ctx.strokeStyle = pColor;
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        switch (type) {
            case 'Fighter':
                ctx.ellipse(0, 0, size/6, size/3, 0, 0, Math.PI * 2);
                ctx.moveTo(0, -size/4);
                ctx.quadraticCurveTo(size/3, 0, 0, size/4);
                ctx.quadraticCurveTo(-size/3, 0, 0, -size/4);
                break;
            case 'Scout':
                ctx.arc(0, 0, size/6, 0, Math.PI * 2);
                ctx.moveTo(0, -size/3);
                ctx.bezierCurveTo(size/2, -size/4, size/2, size/4, 0, size/3);
                ctx.bezierCurveTo(-size/2, size/4, -size/2, -size/4, 0, -size/3);
                break;
            case 'TroopTransport':
                ctx.ellipse(0, 0, size/4, size/3, 0, 0, Math.PI * 2);
                ctx.moveTo(-size/4, 0); ctx.lineTo(-size/3, size/4);
                ctx.moveTo(size/4, 0); ctx.lineTo(size/3, size/4);
                break;
            case 'Salvager':
                ctx.arc(0, 0, size/5, 0, Math.PI * 2);
                ctx.moveTo(0, size/5);
                ctx.bezierCurveTo(size/3, size/2, -size/3, size/2, 0, size/5);
                break;
            case 'Frigate':
                ctx.moveTo(0, -size/2.5);
                ctx.bezierCurveTo(size/3, -size/4, size/2, size/4, size/6, size/3);
                ctx.lineTo(-size/6, size/3);
                ctx.bezierCurveTo(-size/2, size/4, -size/3, -size/4, 0, -size/2.5);
                break;
            case 'SpaceStation':
                ctx.arc(0, 0, size/3, 0, Math.PI * 2);
                ctx.stroke();
                for (let i = 0; i < 6; i++) {
                    ctx.rotate(Math.PI / 3);
                    ctx.beginPath();
                    ctx.ellipse(size/4, 0, size/8, size/12, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
                break;
            default:
                ctx.arc(0, 0, size/5, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();

        // Add "Core"
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(0, 0, size/12, 0, Math.PI * 2);
        ctx.fill();
    }
}
