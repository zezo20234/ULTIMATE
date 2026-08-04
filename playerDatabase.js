/* ==========================================================================
   MASTER PLAYER DATABASE
   Contains 2,000 football players with realistic stats for the Ultimate Team game.
   This data serves as the foundation for all pack openings, market listings, and squads.
   ========================================================================== */

export const PLAYER_DATABASE = generatePlayerDatabase();

function generatePlayerDatabase() {
    const players = [];
    let idCounter = 1;

    // Helper function to create a player
    function createPlayer(name, rating, position, nation, club, league, rarity, pace, shooting, passing, dribbling, defending, physical) {
        return {
            id: `ply_${idCounter++}`,
            name: name,
            rating: rating,
            position: position,
            nation: nation,
            club: club,
            league: league,
            rarity: rarity,
            pace: pace,
            shooting: shooting,
            passing: passing,
            dribbling: dribbling,
            defending: defending,
            physical: physical,
            quickSellValue: calculateQuickSellValue(rating, rarity),
            marketPrice: calculateMarketPrice(rating, rarity)
        };
    }

    function calculateQuickSellValue(rating, rarity) {
        let base = 100;
        if (rarity.includes('Bronze')) base = 15;
        else if (rarity.includes('Silver')) base = 100;
        else if (rarity === 'Gold') base = 300;
        else if (rarity === 'Rare Gold') base = 600;
        else if (rarity === 'TOTW') base = 9750;
        else if (rarity === 'Icon') base = 65000;
        
        let multiplier = 1;
        if (rating >= 90) multiplier = 2.5;
        else if (rating >= 85) multiplier = 1.5;
        else if (rating >= 80) multiplier = 1.2;
        
        return Math.floor(base * multiplier);
    }

    function calculateMarketPrice(rating, rarity) {
        let base = 500;
        if (rarity.includes('Bronze')) base = 200;
        else if (rarity.includes('Silver')) base = 800;
        else if (rarity === 'Gold') base = 2000;
        else if (rarity === 'Rare Gold') base = 5000;
        else if (rarity === 'TOTW') base = 50000;
        else if (rarity === 'Icon') base = 500000;
        
        let multiplier = 1;
        if (rating >= 90) multiplier = 5;
        else if (rating >= 85) multiplier = 3;
        else if (rating >= 80) multiplier = 2;
        
        return Math.floor(base * multiplier * (0.8 + Math.random() * 0.4));
    }

    // ============================================================================
    // ICONS (15 players) - Highest tier, legendary players
    // ============================================================================
    const icons = [
        { name: "Pelé", rating: 98, position: "CAM", nation: "Brazil", club: "Icons", league: "Icons" },
        { name: "Maradona", rating: 97, position: "CAM", nation: "Argentina", club: "Icons", league: "Icons" },
        { name: "Cruyff", rating: 96, position: "CF", nation: "Netherlands", club: "Icons", league: "Icons" },
        { name: "Beckenbauer", rating: 95, position: "CB", nation: "Germany", club: "Icons", league: "Icons" },
        { name: "Zidane", rating: 95, position: "CAM", nation: "France", club: "Icons", league: "Icons" },
        { name: "Ronaldo Nazário", rating: 96, position: "ST", nation: "Brazil", club: "Icons", league: "Icons" },
        { name: "Maldini", rating: 94, position: "CB", nation: "Italy", club: "Icons", league: "Icons" },
        { name: "Matthäus", rating: 94, position: "CDM", nation: "Germany", club: "Icons", league: "Icons" },
        { name: "Henry", rating: 93, position: "ST", nation: "France", club: "Icons", league: "Icons" },
        { name: "Ronaldinho", rating: 93, position: "CAM", nation: "Brazil", club: "Icons", league: "Icons" },
        { name: "Eusébio", rating: 92, position: "ST", nation: "Portugal", club: "Icons", league: "Icons" },
        { name: "Bergkamp", rating: 91, position: "CF", nation: "Netherlands", club: "Icons", league: "Icons" },
        { name: "Ferdinand", rating: 90, position: "CB", nation: "England", club: "Icons", league: "Icons" },
        { name: "Gullit", rating: 90, position: "CM", nation: "Netherlands", club: "Icons", league: "Icons" },
        { name: "Koeman", rating: 89, position: "CB", nation: "Netherlands", club: "Icons", league: "Icons" }
    ];

    icons.forEach(p => {
        const stats = generateStatsForRating(p.rating, p.position);
        players.push(createPlayer(p.name, p.rating, p.position, p.nation, p.club, p.league, "Icon", 
            stats.pace, stats.shooting, stats.passing, stats.dribbling, stats.defending, stats.physical));
    });

    // ============================================================================
    // TOTW SPECIALS (20 players) - Team of the Week high-rated cards
    // ============================================================================
    const totwPlayers = [
        { name: "Haaland TOTW", rating: 91, position: "ST", nation: "Norway", club: "Man City", league: "Premier League" },
        { name: "Mbappé TOTW", rating: 91, position: "ST", nation: "France", club: "Real Madrid", league: "La Liga" },
        { name: "De Bruyne TOTW", rating: 90, position: "CM", nation: "Belgium", club: "Man City", league: "Premier League" },
        { name: "Vinícius Jr TOTW", rating: 90, position: "LW", nation: "Brazil", club: "Real Madrid", league: "La Liga" },
        { name: "Bellingham TOTW", rating: 89, position: "CAM", nation: "England", club: "Real Madrid", league: "La Liga" },
        { name: "Rodri TOTW", rating: 89, position: "CDM", nation: "Spain", club: "Man City", league: "Premier League" },
        { name: "Salah TOTW", rating: 89, position: "RW", nation: "Egypt", club: "Liverpool", league: "Premier League" },
        { name: "Van Dijk TOTW", rating: 89, position: "CB", nation: "Netherlands", club: "Liverpool", league: "Premier League" },
        { name: "Saka TOTW", rating: 88, position: "RW", nation: "England", club: "Arsenal", league: "Premier League" },
        { name: "Rüdiger TOTW", rating: 88, position: "CB", nation: "Germany", club: "Real Madrid", league: "La Liga" },
        { name: "Bernardo Silva TOTW", rating: 88, position: "CM", nation: "Portugal", club: "Man City", league: "Premier League" },
        { name: "Foden TOTW", rating: 87, position: "CAM", nation: "England", club: "Man City", league: "Premier League" },
        { name: "Osimhen TOTW", rating: 87, position: "ST", nation: "Nigeria", club: "Napoli", league: "Serie A" },
        { name: "Lautaro Martínez TOTW", rating: 87, position: "ST", nation: "Argentina", club: "Inter", league: "Serie A" },
        { name: "Leão TOTW", rating: 86, position: "LW", nation: "Portugal", club: "Milan", league: "Serie A" },
        { name: "Bakayoko TOTW", rating: 86, position: "ST", nation: "France", club: "Napoli", league: "Serie A" },
        { name: "Davies TOTW", rating: 86, position: "LB", nation: "Canada", club: "Bayern", league: "Bundesliga" },
        { name: "Gvardiol TOTW", rating: 85, position: "CB", nation: "Croatia", club: "Man City", league: "Premier League" },
        { name: "Musiala TOTW", rating: 85, position: "CAM", nation: "Germany", club: "Bayern", league: "Bundesliga" },
        { name: "Yamal TOTW", rating: 84, position: "RW", nation: "Spain", club: "Barcelona", league: "La Liga" }
    ];

    totwPlayers.forEach(p => {
        const stats = generateStatsForRating(p.rating, p.position);
        players.push(createPlayer(p.name, p.rating, p.position, p.nation, p.club, p.league, "TOTW",
            stats.pace, stats.shooting, stats.passing, stats.dribbling, stats.defending, stats.physical));
    });

    // ============================================================================
    // RARE GOLD (400 players) - 82-89 rated, premium gold cards
    // ============================================================================
    const rareGoldData = generateRareGoldPlayers();
    rareGoldData.forEach(p => {
        const stats = generateStatsForRating(p.rating, p.position);
        players.push(createPlayer(p.name, p.rating, p.position, p.nation, p.club, p.league, "Rare Gold",
            stats.pace, stats.shooting, stats.passing, stats.dribbling, stats.defending, stats.physical));
    });

    // ============================================================================
    // GOLD (800 players) - 75-81 rated, standard gold cards
    // ============================================================================
    const goldData = generateGoldPlayers();
    goldData.forEach(p => {
        const stats = generateStatsForRating(p.rating, p.position);
        players.push(createPlayer(p.name, p.rating, p.position, p.nation, p.club, p.league, "Gold",
            stats.pace, stats.shooting, stats.passing, stats.dribbling, stats.defending, stats.physical));
    });

    // ============================================================================
    // RARE SILVER (300 players) - 65-74 rated, premium silver cards
    // ============================================================================
    const rareSilverData = generateRareSilverPlayers();
    rareSilverData.forEach(p => {
        const stats = generateStatsForRating(p.rating, p.position);
        players.push(createPlayer(p.name, p.rating, p.position, p.nation, p.club, p.league, "Rare Silver",
            stats.pace, stats.shooting, stats.passing, stats.dribbling, stats.defending, stats.physical));
    });

    // ============================================================================
    // SILVER (300 players) - 65-74 rated, standard silver cards
    // ============================================================================
    const silverData = generateSilverPlayers();
    silverData.forEach(p => {
        const stats = generateStatsForRating(p.rating, p.position);
        players.push(createPlayer(p.name, p.rating, p.position, p.nation, p.club, p.league, "Silver",
            stats.pace, stats.shooting, stats.passing, stats.dribbling, stats.defending, stats.physical));
    });

    // ============================================================================
    // BRONZE (130 players) - 40-64 rated, bronze cards
    // ============================================================================
    const bronzeData = generateBronzePlayers();
    bronzeData.forEach(p => {
        const stats = generateStatsForRating(p.rating, p.position);
        players.push(createPlayer(p.name, p.rating, p.position, p.nation, p.club, p.league, "Bronze",
            stats.pace, stats.shooting, stats.passing, stats.dribbling, stats.defending, stats.physical));
    });

    console.log(`Generated ${players.length} players in total`);
    return players;
}

function generateStatsForRating(rating, position) {
    // Base stats that sum to approximately rating * 6
    const totalTarget = rating * 6;
    let pace, shooting, passing, dribbling, defending, physical;

    const pos = position.toUpperCase();
    
    // Position-specific stat distributions
    if (pos.includes('ST') || pos.includes('CF')) {
        pace = rating + randomOffset(3);
        shooting = rating + randomOffset(4);
        passing = rating - 5 + randomOffset(3);
        dribbling = rating + randomOffset(2);
        defending = rating - 15 + randomOffset(5);
        physical = rating - 3 + randomOffset(3);
    } else if (pos.includes('LW') || pos.includes('RW') || pos.includes('LM') || pos.includes('RM')) {
        pace = rating + 3 + randomOffset(3);
        shooting = rating - 2 + randomOffset(4);
        passing = rating - 3 + randomOffset(3);
        dribbling = rating + 2 + randomOffset(3);
        defending = rating - 12 + randomOffset(5);
        physical = rating - 5 + randomOffset(3);
    } else if (pos.includes('CAM') || pos.includes('CM') || pos.includes('CDM')) {
        pace = rating - 3 + randomOffset(4);
        shooting = rating - 4 + randomOffset(4);
        passing = rating + 3 + randomOffset(3);
        dribbling = rating + randomOffset(3);
        defending = rating - 2 + randomOffset(4);
        physical = rating - 2 + randomOffset(3);
    } else if (pos.includes('CB')) {
        pace = rating - 8 + randomOffset(5);
        shooting = rating - 12 + randomOffset(5);
        passing = rating - 5 + randomOffset(4);
        dribbling = rating - 8 + randomOffset(4);
        defending = rating + 4 + randomOffset(3);
        physical = rating + 2 + randomOffset(3);
    } else if (pos.includes('LB') || pos.includes('RB') || pos.includes('LWB') || pos.includes('RWB')) {
        pace = rating + 2 + randomOffset(3);
        shooting = rating - 10 + randomOffset(5);
        passing = rating - 2 + randomOffset(3);
        dribbling = rating - 2 + randomOffset(3);
        defending = rating + randomOffset(3);
        physical = rating + randomOffset(3);
    } else if (pos.includes('GK')) {
        pace = rating - 15 + randomOffset(5);
        shooting = rating - 15 + randomOffset(5);
        passing = rating - 8 + randomOffset(4);
        dribbling = rating - 12 + randomOffset(5);
        defending = rating + 5 + randomOffset(3);
        physical = rating + 3 + randomOffset(3);
    } else {
        // Default balanced stats
        pace = rating + randomOffset(3);
        shooting = rating + randomOffset(3);
        passing = rating + randomOffset(3);
        dribbling = rating + randomOffset(3);
        defending = rating + randomOffset(3);
        physical = rating + randomOffset(3);
    }

    // Clamp all stats between 1 and 99
    pace = Math.max(1, Math.min(99, pace));
    shooting = Math.max(1, Math.min(99, shooting));
    passing = Math.max(1, Math.min(99, passing));
    dribbling = Math.max(1, Math.min(99, dribbling));
    defending = Math.max(1, Math.min(99, defending));
    physical = Math.max(1, Math.min(99, physical));

    return { pace, shooting, passing, dribbling, defending, physical };
}

function randomOffset(range) {
    return Math.floor(Math.random() * (range * 2 + 1)) - range;
}

function generateRareGoldPlayers() {
    const players = [];
    const names = [
        "Kane", "Son", "Sterling", "Trippier", "Maguire", "Rashford", "Sancho", "Bellingham", "Rice", "Saka",
        "Salah", "Van Dijk", "Alisson", "Firmino", "Jota", "Alexander-Arnold", "Robertson", "Fabinho", "Thiago", "Henderson",
        "Messi", "Suárez", "Busquets", "Ter Stegen", "Alba", "Pedri", "Gavi", "Lewandowski", "Kimmich", "Müller",
        "Modrić", "Kroos", "Casemiro", "Courtois", "Carvajal", "Militão", "Alaba", "Vinícius", "Rodrygo", "Valverde",
        "Donnarumma", "Leão", "Theo Hernández", "Tomori", "Barella", "Vlahović", "Chiesa", "Bastoni", "Acerbi", "Di Lorenzo",
        "Neuer", "Sane", "Goretzka", "Kimmich", "Müller", "Coman", "Davies", "Upamecano", "Hernández", "Sabitzer",
        "TAA", "Rashford", "Shaw", "Maguire", "Martinez", "Dalot", "Casemiro", "Eriksen", "Fred", "McTominay",
        "Ederson", "Dias", "Stones", "Walker", "Cancelo", "Silva", "Rodri", "De Bruyne", "Bernardo", "Foden",
        "Lloris", "Romero", "Dier", "Royal", "Højbjerg", "Bentancur", "Kulusevski", "Son", "Kane", "Richarlison",
        "Raya", "White", "Saliba", "Gabriel", "Zinchenko", "Partey", "Xhaka", "Odegaard", "Saka", "Martinelli",
        "Alisson", "Alexander-Arnold", "Konaté", "Van Dijk", "Robertson", "Fabinho", "Henderson", "Thiago", "Salah", "Núñez",
        "Ederson", "Walker", "Dias", "Stones", "Cancelo", "Rodri", "De Bruyne", "Silva", "Foden", "Grealish",
        "Courtois", "Carvajal", "Militão", "Alaba", "Mendy", "Casemiro", "Kroos", "Modrić", "Vinícius", "Benzema",
        "Ter Stegen", "Roberto", "Araújo", "Piqué", "Alba", "Busquets", "Pedri", "De Jong", "Dembélé", "Lewandowski",
        "Handanović", "Dumfries", "De Vrij", "Bastoni", "Dimarco", "Barella", "Brozović", "Barrella", "Lautaro", "Džeko",
        "Maignan", "Hernández", "Koundé", "Marquinhos", "Pereira", "Verratti", "Renato", "Messi", "Neymar", "Mbappé",
        "Oblak", "Trippier", "Savic", "Giménez", "Reyes", "Koke", "Saúl", "Carrasco", "João Félix", "Griezmann",
        "Neuer", "Pavard", "Upamecano", "Hernández", "Davies", "Goretzka", "Kimmich", "Musiala", "Sane", "Coman",
        "Onana", "Mazraoui", "De Ligt", "Martínez", "Blind", "Berghuis", "Klaassen", "De Jong", "Tadic", "Antony"
    ];

    const clubs = [
        "Man City", "Liverpool", "Arsenal", "Man United", "Chelsea", "Tottenham", "Newcastle", "Brighton",
        "Real Madrid", "Barcelona", "Atlético Madrid", "Sevilla", "Real Sociedad", "Villarreal", "Real Betis",
        "Bayern Munich", "Dortmund", "Leipzig", "Leverkusen", "Frankfurt", "Wolfsburg",
        "Inter", "Milan", "Juventus", "Napoli", "Roma", "Lazio", "Atalanta",
        "PSG", "Marseille", "Lyon", "Monaco", "Nice", "Lens"
    ];

    const leagues = [
        "Premier League", "Premier League", "Premier League", "Premier League", "Premier League", "Premier League", "Premier League", "Premier League",
        "La Liga", "La Liga", "La Liga", "La Liga", "La Liga", "La Liga", "La Liga",
        "Bundesliga", "Bundesliga", "Bundesliga", "Bundesliga", "Bundesliga", "Bundesliga",
        "Serie A", "Serie A", "Serie A", "Serie A", "Serie A", "Serie A", "Serie A",
        "Ligue 1", "Ligue 1", "Ligue 1", "Ligue 1", "Ligue 1", "Ligue 1"
    ];

    const nations = [
        "England", "England", "England", "England", "England", "England", "England", "England", "England", "England",
        "Brazil", "Brazil", "Brazil", "Brazil", "Brazil", "Brazil", "Brazil", "Brazil", "Brazil", "Brazil",
        "France", "France", "France", "France", "France", "France", "France", "France", "France", "France",
        "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany",
        "Spain", "Spain", "Spain", "Spain", "Spain", "Spain", "Spain", "Spain", "Spain", "Spain",
        "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy",
        "Argentina", "Argentina", "Argentina", "Argentina", "Argentina", "Argentina", "Argentina", "Argentina", "Argentina", "Argentina",
        "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal",
        "Netherlands", "Netherlands", "Netherlands", "Netherlands", "Netherlands", "Netherlands", "Netherlands", "Netherlands", "Netherlands", "Netherlands",
        "Belgium", "Belgium", "Belgium", "Belgium", "Belgium", "Belgium", "Belgium", "Belgium", "Belgium", "Belgium"
    ];

    const positions = ["ST", "CF", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB", "GK"];

    for (let i = 0; i < 400; i++) {
        const name = names[i % names.length];
        // Vary rating slightly for duplicates instead of numbering
        const rating = 82 + Math.floor(Math.random() * 8) + Math.floor(Math.random() * 3) - 1; // 81-91 with variation
        const position = positions[Math.floor(Math.random() * positions.length)];
        const nation = nations[i % nations.length];
        const club = clubs[i % clubs.length];
        const league = leagues[i % leagues.length];

        players.push({ name, rating, position, nation, club, league });
    }

    return players;
}

function generateGoldPlayers() {
    const players = [];
    const names = [
        "Wilson", "Wood", "Saint-Maximin", "Guimarães", "Isak", "Botman", "Burn", "Trippier", "Pope", "Almiron",
        "Zaha", "Eze", "Olise", "Guehi", "Mitchell", "Anderson", "Holding", "Johnstone", "Schlupp", "Edouard",
        "Bowen", "Antonio", "Souček", "Paquetá", "Rice", "Zouma", "Ogbonna", "Cresswell", "Fabianski", "Benrahma",
        "Toney", "Mbeumo", "Wissa", "Jensen", "Nørgaard", "Pinnock", "Sosa", "Flekær", "Raya", "Henry",
        "Martinez", "Cash", "Mings", "Konsa", "Digne", "McGinn", "Buendía", "Watkins", "Ings", "Steer",
        "Hennessey", "Nelson", "Williams", "Bednarek", "Salisu", "Lyanco", "Ward-Prowse", "Armstrong", "Adams", "Broja",
        "Raya", "Castagne", "Tarkowski", "Mina", "Patterson", "Doucoure", "Iwobi", "Gray", "Calvert-Lewin", "Pickford",
        "Fabianski", "Coufal", "Zouma", "Ogbonna", "Cresswell", "Souček", "Fornals", "Bowen", "Antonio", "Areola",
        "Gunn", "Aarons", "Hanley", "Gibson", "Williams", "McLean", "Normann", "Rashica", "Pukki", "Krupić",
        "Ramsdale", "White", "Saliba", "Gabriel", "Zinchenko", "Partey", "Xhaka", "Odegaard", "Saka", "Martinelli",
        "Lloris", "Romero", "Dier", "Royal", "Højbjerg", "Bentancur", "Kulusevski", "Son", "Kane", "Richarlison",
        "Ederson", "Walker", "Dias", "Stones", "Cancelo", "Rodri", "De Bruyne", "Silva", "Foden", "Grealish",
        "Alisson", "Alexander-Arnold", "Konaté", "Van Dijk", "Robertson", "Fabinho", "Henderson", "Thiago", "Salah", "Núñez",
        "Kelleher", "Gomez", "Matip", "Van Dijk", "Tsimikas", "Milner", "Keïta", "Jones", "Elliott", "Carvalho",
        "De Gea", "Dalot", "Lindelöf", "Martínez", "Shaw", "Casemiro", "Eriksen", "Fred", "Rashford", "Sancho",
        "Dubravka", "Trippier", "Schar", "Botman", "Burn", "Guimarães", "Willock", "Joelinton", "Wilson", "Almiron",
        "Pope", "Trippier", "Botman", "Schar", "Burn", "Guimarães", "Willock", "Joelinton", "Wilson", "Isak",
        "Leno", "Castagne", "Tarkowski", "Mina", "Patterson", "Doucoure", "Iwobi", "Gray", "Calvert-Lewin", "Maupay",
        "Fabianski", "Coufal", "Zouma", "Ogbonna", "Emerson", "Souček", "Fornals", "Bowen", "Antonio", "Scamacca"
    ];

    const clubs = [
        "Newcastle", "Newcastle", "Newcastle", "Newcastle", "Newcastle", "Newcastle", "Newcastle", "Newcastle", "Newcastle", "Newcastle",
        "Crystal Palace", "Crystal Palace", "Crystal Palace", "Crystal Palace", "Crystal Palace", "Crystal Palace", "Crystal Palace", "Crystal Palace", "Crystal Palace", "Crystal Palace",
        "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham",
        "Brentford", "Brentford", "Brentford", "Brentford", "Brentford", "Brentford", "Brentford", "Brentford", "Brentford", "Brentford",
        "Aston Villa", "Aston Villa", "Aston Villa", "Aston Villa", "Aston Villa", "Aston Villa", "Aston Villa", "Aston Villa", "Aston Villa", "Aston Villa",
        "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton",
        "Everton", "Everton", "Everton", "Everton", "Everton", "Everton", "Everton", "Everton", "Everton", "Everton",
        "Leeds", "Leeds", "Leeds", "Leeds", "Leeds", "Leeds", "Leeds", "Leeds", "Leeds", "Leeds",
        "Leicester", "Leicester", "Leicester", "Leicester", "Leicester", "Leicester", "Leicester", "Leicester", "Leicester", "Leicester",
        "Wolves", "Wolves", "Wolves", "Wolves", "Wolves", "Wolves", "Wolves", "Wolves", "Wolves", "Wolves"
    ];

    const leagues = Array(10).fill("Premier League");

    const nations = [
        "England", "England", "England", "England", "England", "England", "England", "England", "England", "England",
        "Ivory Coast", "France", "France", "England", "England", "England", "England", "England", "France", "France",
        "England", "Jamaica", "Czech Republic", "Ghana", "England", "France", "France", "England", "England", "Algeria",
        "Denmark", "France", "France", "Denmark", "Denmark", "Denmark", "Denmark", "Denmark", "Denmark", "Denmark",
        "Argentina", "Ireland", "England", "Argentina", "France", "Scotland", "Argentina", "England", "England", "England",
        "Wales", "Morocco", "Ivory Coast", "South Africa", "England", "Scotland", "Scotland", "Austria", "Austria", "Austria",
        "Ireland", "Ivory Coast", "Ivory Coast", "Ivory Coast", "Scotland", "Denmark", "Nigeria", "England", "England", "England",
        "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland",
        "Norway", "Norway", "Norway", "Norway", "Norway", "Norway", "Norway", "Norway", "Norway", "Norway",
        "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal"
    ];

    const positions = ["ST", "CF", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB", "GK"];

    for (let i = 0; i < 800; i++) {
        const name = names[i % names.length];
        // Vary rating slightly for duplicates instead of numbering
        const rating = 75 + Math.floor(Math.random() * 7) + Math.floor(Math.random() * 3) - 1; // 74-81 with variation
        const position = positions[Math.floor(Math.random() * positions.length)];
        const nation = nations[i % nations.length];
        const club = clubs[i % clubs.length];
        const league = leagues[i % leagues.length];

        players.push({ name, rating, position, nation, club, league });
    }

    return players;
}

function generateRareSilverPlayers() {
    const players = [];
    const names = [
        "Taylor", "Harwood", "Campbell", "Fernández", "Cantwell", "Rashica", "Pukki", "Gunn", "Aarons", "Williams",
        "Cairney", "Reed", "Carvalho", "Palhinha", "Mitrović", "Jiménez", "Neeskens", "Decordova-Reid", "Robinson", "Leno",
        "Bamba", "Carter-Vickers", "Taylor", "Bernardo", "Johansen", "McGregor", "O'Riley", "Abada", "Juranović", "Hart",
        "Fischer", "Mitchell", "Stevens", "Brennan", "Howson", "Crooks", "Jones", "Forss", "Sporar", "Stěpan",
        "Leno", "Soares", "Holden", "Mee", "Tarkowski", "Brownhill", "Westwood", "Wood", "Barnes", "Collins",
        "Kovar", "Johnson", "Pearce", "Moore", "Nomme", "Shackleton", "Rothwell", "Gnoto", "Sharp", "Ndiaye",
        "Long", "Harwood-Bellis", "Mee", "Dunk", "Webster", "Bissouma", "Lallana", "Mac Allister", "Trossard", "March",
        "Gunn", "Hennessey", "Nelson", "Williams", "Bednarek", "Salisu", "Lyanco", "Ward-Prowse", "Armstrong", "Adams",
        "Fabianski", "Coufal", "Zouma", "Ogbonna", "Cresswell", "Souček", "Fornals", "Bowen", "Antonio", "Areola",
        "Raya", "Castagne", "Tarkowski", "Mina", "Patterson", "Doucoure", "Iwobi", "Gray", "Calvert-Lewin", "Pickford"
    ];

    const clubs = [
        "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich",
        "Fulham", "Fulham", "Fulham", "Fulham", "Fulham", "Fulham", "Fulham", "Fulham", "Fulham", "Fulham",
        "Celtic", "Celtic", "Celtic", "Celtic", "Celtic", "Celtic", "Celtic", "Celtic", "Celtic", "Celtic",
        "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough",
        "Burnley", "Burnley", "Burnley", "Burnley", "Burnley", "Burnley", "Burnley", "Burnley", "Burnley", "Burnley",
        "Sheffield United", "Sheffield United", "Sheffield United", "Sheffield United", "Sheffield United", "Sheffield United", "Sheffield United", "Sheffield United", "Sheffield United", "Sheffield United",
        "Brighton", "Brighton", "Brighton", "Brighton", "Brighton", "Brighton", "Brighton", "Brighton", "Brighton", "Brighton",
        "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton", "Southampton",
        "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham", "West Ham",
        "Everton", "Everton", "Everton", "Everton", "Everton", "Everton", "Everton", "Everton", "Everton", "Everton"
    ];

    const leagues = Array(10).fill("Championship");

    const nations = [
        "England", "England", "England", "England", "England", "England", "England", "England", "England", "England",
        "Portugal", "Portugal", "Portugal", "Portugal", "Serbia", "Portugal", "Netherlands", "Portugal", "Portugal", "Portugal",
        "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland",
        "England", "England", "England", "England", "England", "England", "England", "England", "England", "England",
        "England", "England", "England", "England", "England", "England", "England", "England", "England", "England",
        "England", "England", "England", "England", "England", "England", "England", "England", "England", "England",
        "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland",
        "Wales", "Wales", "Wales", "Wales", "Wales", "Wales", "Wales", "Wales", "Wales", "Wales",
        "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland",
        "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden"
    ];

    const positions = ["ST", "CF", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB", "GK"];

    for (let i = 0; i < 300; i++) {
        const name = names[i % names.length];
        // Vary rating slightly for duplicates instead of numbering
        const rating = 68 + Math.floor(Math.random() * 7) + Math.floor(Math.random() * 3) - 1; // 67-74 with variation
        const position = positions[Math.floor(Math.random() * positions.length)];
        const nation = nations[i % nations.length];
        const club = clubs[i % clubs.length];
        const league = leagues[i % leagues.length];

        players.push({ name, rating, position, nation, club, league });
    }

    return players;
}

function generateSilverPlayers() {
    const players = [];
    const names = [
        "Smith", "Jones", "Brown", "Wilson", "Taylor", "Davies", "Evans", "Thomas", "Walker", "White",
        "Roberts", "Clark", "Hall", "Young", "King", "Wright", "Green", "Hill", "Wood", "Cooper",
        "Morris", "Bell", "Bailey", "Baker", "Carter", "Mitchell", "Phillips", "Scott", "Edwards", "Collins",
        "Murphy", "Cook", "Rogers", "Morgan", "Bellamy", "Pearson", "Fisher", "Gray", "James", "Mason",
        "Reid", "O'Brien", "Byrne", "Ryan", "Gordon", "Shaw", "Price", "Bennett", "Barnes", "Harrison",
        "Ross", "Foster", "Cole", "Stone", "Holmes", "Reynolds", "Knight", "Graves", "Cooper", "Harvey",
        "Burke", "Sutton", "Matthews", "Watson", "Grant", "Richards", "Lawson", "Fowler", "Wheeler", "Fields",
        "Powell", "Long", "Patterson", "Hughes", "Marsh", "Gibson", "Jordan", "Carroll", "Duncan", "Brady",
        "Stevens", "Richardson", "Lane", "Gordon", "Hart", "Kemp", "Frost", "Simpson", "Hanson", "O'Connor",
        "Byrne", "Kennedy", "Owens", "Higgins", "Fitzgerald", "Ryan", "Sullivan", "Walsh", "O'Connor", "Reilly"
    ];

    const clubs = [
        "Reading", "Reading", "Reading", "Reading", "Reading", "Reading", "Reading", "Reading", "Reading", "Reading",
        "Blackpool", "Blackpool", "Blackpool", "Blackpool", "Blackpool", "Blackpool", "Blackpool", "Blackpool", "Blackpool", "Blackpool",
        "Plymouth", "Plymouth", "Plymouth", "Plymouth", "Plymouth", "Plymouth", "Plymouth", "Plymouth", "Plymouth", "Plymouth",
        "Bristol City", "Bristol City", "Bristol City", "Bristol City", "Bristol City", "Bristol City", "Bristol City", "Bristol City", "Bristol City", "Bristol City",
        "Swansea", "Swansea", "Swansea", "Swansea", "Swansea", "Swansea", "Swansea", "Swansea", "Swansea", "Swansea",
        "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich", "Norwich",
        "Coventry", "Coventry", "Coventry", "Coventry", "Coventry", "Coventry", "Coventry", "Coventry", "Coventry", "Coventry",
        "Millwall", "Millwall", "Millwall", "Millwall", "Millwall", "Millwall", "Millwall", "Millwall", "Millwall", "Millwall",
        "Luton Town", "Luton Town", "Luton Town", "Luton Town", "Luton Town", "Luton Town", "Luton Town", "Luton Town", "Luton Town", "Luton Town",
        "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough", "Middlesbrough"
    ];

    const leagues = Array(10).fill("League One");

    const nations = [
        "England", "England", "England", "England", "England", "England", "England", "England", "England", "England",
        "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland", "Scotland",
        "Wales", "Wales", "Wales", "Wales", "Wales", "Wales", "Wales", "Wales", "Wales", "Wales",
        "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland",
        "Northern Ireland", "Northern Ireland", "Northern Ireland", "Northern Ireland", "Northern Ireland", "Northern Ireland", "Northern Ireland", "Northern Ireland", "Northern Ireland", "Northern Ireland",
        "France", "France", "France", "France", "France", "France", "France", "France", "France", "France",
        "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany",
        "Spain", "Spain", "Spain", "Spain", "Spain", "Spain", "Spain", "Spain", "Spain", "Spain",
        "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy",
        "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal", "Portugal"
    ];

    const positions = ["ST", "CF", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB", "GK"];

    for (let i = 0; i < 300; i++) {
        const name = names[i % names.length];
        // Vary rating slightly for duplicates instead of numbering
        const rating = 65 + Math.floor(Math.random() * 10) + Math.floor(Math.random() * 3) - 1; // 64-74 with variation
        const position = positions[Math.floor(Math.random() * positions.length)];
        const nation = nations[i % nations.length];
        const club = clubs[i % clubs.length];
        const league = leagues[i % leagues.length];

        players.push({ name, rating, position, nation, club, league });
    }

    return players;
}

function generateBronzePlayers() {
    const players = [];
    const names = [
        "Anderson", "Johansson", "Nilsson", "Eriksson", "Larsson", "Gustafsson", "Bergström", "Lindqvist", "Holmgren", "Söderberg",
        "Müller", "Schmidt", "Weber", "Fischer", "Meyer", "Wagner", "Becker", "Hoffmann", "Schneider", "Braun",
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Garcia", "Rodriguez", "Wilson",
        "Martinez", "Gonzalez", "Hernandez", "Lopez", "Garcia", "Rivera", "Torres", "Flores", "Ramirez", "Sanchez",
        "Rossi", "Romano", "Colombo", "Ferrari", "Ricci", "Moretti", "Conti", "Greco", "Rizzo", "Lombardi",
        "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau",
        "Kowalski", "Nowak", "Wojcik", "Kowalczyk", "Lewandowski", "Kaminski", "Jaworski", "Wisniewski", "Szymanski", "Wojciechowski",
        "Murphy", "O'Brien", "Ryan", "Sullivan", "Walsh", "O'Connor", "Byrne", "Kennedy", "Owens", "Higgins",
        "Patel", "Singh", "Kumar", "Sharma", "Verma", "Gupta", "Malhotra", "Chopra", "Mehta", "Jain",
        "Tanaka", "Yamamoto", "Suzuki", "Takahashi", "Kobayashi", "Nakamura", "Sato", "Ito", "Yamashita", "Watanabe"
    ];

    const clubs = [
        "IFK Göteborg", "IFK Göteborg", "IFK Göteborg", "IFK Göteborg", "IFK Göteborg", "IFK Göteborg", "IFK Göteborg", "IFK Göteborg", "IFK Göteborg", "IFK Göteborg",
        "FC St. Pauli", "FC St. Pauli", "FC St. Pauli", "FC St. Pauli", "FC St. Pauli", "FC St. Pauli", "FC St. Pauli", "FC St. Pauli", "FC St. Pauli", "FC St. Pauli",
        "Portsmouth", "Portsmouth", "Portsmouth", "Portsmouth", "Portsmouth", "Portsmouth", "Portsmouth", "Portsmouth", "Portsmouth", "Portsmouth",
        "Santos Laguna", "Santos Laguna", "Santos Laguna", "Santos Laguna", "Santos Laguna", "Santos Laguna", "Santos Laguna", "Santos Laguna", "Santos Laguna", "Santos Laguna",
        "Bologna", "Bologna", "Bologna", "Bologna", "Bologna", "Bologna", "Bologna", "Bologna", "Bologna", "Bologna",
        "Nantes", "Nantes", "Nantes", "Nantes", "Nantes", "Nantes", "Nantes", "Nantes", "Nantes", "Nantes",
        "Lech Poznan", "Lech Poznan", "Lech Poznan", "Lech Poznan", "Lech Poznan", "Lech Poznan", "Lech Poznan", "Lech Poznan", "Lech Poznan", "Lech Poznan",
        "Shamrock Rovers", "Shamrock Rovers", "Shamrock Rovers", "Shamrock Rovers", "Shamrock Rovers", "Shamrock Rovers", "Shamrock Rovers", "Shamrock Rovers", "Shamrock Rovers", "Shamrock Rovers",
        "Mumbai City", "Mumbai City", "Mumbai City", "Mumbai City", "Mumbai City", "Mumbai City", "Mumbai City", "Mumbai City", "Mumbai City", "Mumbai City",
        "Urawa Red Diamonds", "Urawa Red Diamonds", "Urawa Red Diamonds", "Urawa Red Diamonds", "Urawa Red Diamonds", "Urawa Red Diamonds", "Urawa Red Diamonds", "Urawa Red Diamonds", "Urawa Red Diamonds", "Urawa Red Diamonds"
    ];

    const leagues = [
        "Allsvenskan", "Allsvenskan", "Allsvenskan", "Allsvenskan", "Allsvenskan", "Allsvenskan", "Allsvenskan", "Allsvenskan", "Allsvenskan", "Allsvenskan",
        "2. Bundesliga", "2. Bundesliga", "2. Bundesliga", "2. Bundesliga", "2. Bundesliga", "2. Bundesliga", "2. Bundesliga", "2. Bundesliga", "2. Bundesliga", "2. Bundesliga",
        "League Two", "League Two", "League Two", "League Two", "League Two", "League Two", "League Two", "League Two", "League Two", "League Two",
        "Liga MX", "Liga MX", "Liga MX", "Liga MX", "Liga MX", "Liga MX", "Liga MX", "Liga MX", "Liga MX", "Liga MX",
        "Serie B", "Serie B", "Serie B", "Serie B", "Serie B", "Serie B", "Serie B", "Serie B", "Serie B", "Serie B",
        "Ligue 2", "Ligue 2", "Ligue 2", "Ligue 2", "Ligue 2", "Ligue 2", "Ligue 2", "Ligue 2", "Ligue 2", "Ligue 2",
        "Ekstraklasa", "Ekstraklasa", "Ekstraklasa", "Ekstraklasa", "Ekstraklasa", "Ekstraklasa", "Ekstraklasa", "Ekstraklasa", "Ekstraklasa", "Ekstraklasa",
        "League of Ireland", "League of Ireland", "League of Ireland", "League of Ireland", "League of Ireland", "League of Ireland", "League of Ireland", "League of Ireland", "League of Ireland", "League of Ireland",
        "Indian Super League", "Indian Super League", "Indian Super League", "Indian Super League", "Indian Super League", "Indian Super League", "Indian Super League", "Indian Super League", "Indian Super League", "Indian Super League",
        "J1 League", "J1 League", "J1 League", "J1 League", "J1 League", "J1 League", "J1 League", "J1 League", "J1 League", "J1 League"
    ];

    const nations = [
        "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden", "Sweden",
        "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany",
        "England", "England", "England", "England", "England", "England", "England", "England", "England", "England",
        "Mexico", "Mexico", "Mexico", "Mexico", "Mexico", "Mexico", "Mexico", "Mexico", "Mexico", "Mexico",
        "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy",
        "France", "France", "France", "France", "France", "France", "France", "France", "France", "France",
        "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland", "Poland",
        "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland", "Ireland",
        "India", "India", "India", "India", "India", "India", "India", "India", "India", "India",
        "Japan", "Japan", "Japan", "Japan", "Japan", "Japan", "Japan", "Japan", "Japan", "Japan"
    ];

    const positions = ["ST", "CF", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB", "GK"];

    for (let i = 0; i < 165; i++) {
        const name = names[i % names.length];
        // Vary rating slightly for duplicates instead of numbering
        const rating = 40 + Math.floor(Math.random() * 25) + Math.floor(Math.random() * 3) - 1; // 39-64 with variation
        const position = positions[Math.floor(Math.random() * positions.length)];
        const nation = nations[i % nations.length];
        const club = clubs[i % clubs.length];
        const league = leagues[i % leagues.length];

        players.push({ name, rating, position, nation, club, league });
    }

    return players;
}