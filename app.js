const weatherForm = document.querySelector('#weather-form');
const cityInput = document.querySelector('#city-input');
const searchButton = document.querySelector('#search-button');
const statusMessage = document.querySelector('#status-message');
const weatherResult = document.querySelector('#weather-result');
const weatherThemeClasses = [
    'weather-clear-day',
    'weather-clear-night',
    'weather-partly-day',
    'weather-partly-night',
    'weather-cloudy',
    'weather-fog',
    'weather-rain',
    'weather-snow',
    'weather-storm',
    'weather-windy'
];

/**
 * 사용자가 입력한 지역명을 이용해 Open-Meteo Geocoding API를 호출한다.
 * 검색 결과 중 첫 번째 위치에서 화면 표시용 정보와 위도, 경도를 추출한다.
 * HTTP 요청이 실패하거나 검색 결과가 없으면 상위 함수가 처리할 예외를 발생시킨다.
 */
async function searchLocation(city) {
    const searchParams = new URLSearchParams({
        name: city,
        count: '1',
        language: 'ko',
        format: 'json'
    });

    // 사용자 입력을 URLSearchParams로 인코딩해 안전한 요청 주소를 만든다.
    const url = `https://geocoding-api.open-meteo.com/v1/search?${searchParams}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`지역 검색 HTTP 오류: ${response.status}`);
    }

    const data = await response.json();

    // 결과가 없을 때 다음 API를 호출하지 않도록 명확한 오류로 중단한다.
    if (!data.results || data.results.length === 0) {
        throw new Error('LOCATION_NOT_FOUND');
    }

    const location = data.results[0];

    return {
        name: location.name,
        admin1: location.admin1 || '',
        country: location.country || '',
        latitude: location.latitude,
        longitude: location.longitude
    };
}

/**
 * 지역 검색에서 얻은 위도와 경도로 Open-Meteo Forecast API를 호출한다.
 * 현재 기온, 체감 온도, 강수 확률, 풍속만 이해하기 쉬운 객체로 정리한다.
 * HTTP 또는 응답 데이터에 문제가 있으면 상위 함수에서 처리하도록 예외를 전달한다.
 */
async function fetchWeather(latitude, longitude) {
    const searchParams = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: 'temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code,is_day',
        wind_speed_unit: 'ms',
        timezone: 'auto'
    });

    // 학습 범위에 필요한 현재 날씨 항목만 요청한다.
    const url = `https://api.open-meteo.com/v1/forecast?${searchParams}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`날씨 조회 HTTP 오류: ${response.status}`);
    }

    const data = await response.json();

    // 예상한 현재 날씨 객체가 없으면 잘못된 값을 화면에 표시하지 않는다.
    if (!data.current) {
        throw new Error('WEATHER_DATA_NOT_FOUND');
    }

    return {
        temperature: data.current.temperature_2m,
        apparentTemperature: data.current.apparent_temperature,
        precipitationProbability: data.current.precipitation_probability,
        windSpeed: data.current.wind_speed_10m,
        weatherCode: data.current.weather_code,
        isDay: data.current.is_day === 1
    };
}

/**
 * Open-Meteo의 WMO 날씨 코드와 낮·밤 정보를 배경 테마 이름으로 변환한다.
 * 비슷한 날씨 코드를 맑음, 구름, 안개, 비, 눈, 뇌우 범주로 단순하게 묶는다.
 * 알 수 없는 코드가 들어오면 안전한 기본값인 흐림 테마를 반환한다.
 */
function getWeatherTheme(weather) {
    const code = weather.weatherCode;

    // 뇌우와 눈은 강수 확률보다 구체적인 현재 상태이므로 가장 먼저 분리한다.
    if ([95, 96, 99].includes(code)) {
        return 'weather-storm';
    }

    if ([71, 73, 75, 77, 85, 86].includes(code)) {
        return 'weather-snow';
    }

    // 비 코드이거나 강수 확률이 매우 높으면 우산 안내와 일치하는 비 테마를 사용한다.
    const isRainCode = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);

    if (isRainCode || weather.precipitationProbability >= 70) {
        return 'weather-rain';
    }

    // 나머지 맑음과 구름 상태는 낮과 밤에 서로 다른 천체를 보여준다.
    if (code === 0) {
        return weather.isDay ? 'weather-clear-day' : 'weather-clear-night';
    }

    if ([1, 2].includes(code)) {
        return weather.isDay ? 'weather-partly-day' : 'weather-partly-night';
    }

    if (code === 3) {
        return 'weather-cloudy';
    }

    if ([45, 48].includes(code)) {
        return 'weather-fog';
    }

    return 'weather-cloudy';
}

/**
 * 현재 body에 남아 있는 날씨 클래스를 제거하고 새 날씨 테마를 적용한다.
 * 날씨 정보가 없으면 기본 파스텔 배경으로 돌아가며 별도 효과를 표시하지 않는다.
 * 풍속이 강하면 기본 날씨 테마와 함께 강풍 보조 클래스를 추가한다.
 */
function applyWeatherTheme(weather) {
    // 검색을 반복해도 이전 지역의 날씨 효과가 남지 않도록 먼저 모두 제거한다.
    document.body.classList.remove(...weatherThemeClasses);

    if (!weather) {
        return;
    }

    document.body.classList.add(getWeatherTheme(weather));

    if (weather.windSpeed >= 10) {
        document.body.classList.add('weather-windy');
    }
}

/**
 * 날씨 결과 영역에서 반복해서 사용하는 한 개의 정보 행을 생성한다.
 * 항목의 이름과 값을 각각 별도 요소에 넣어 정보 구조를 명확하게 유지한다.
 * 완성된 DOM 요소를 반환하며 실제 화면 추가는 호출한 함수가 담당한다.
 */
function createWeatherItem(label, value) {
    const item = document.createElement('div');
    const itemLabel = document.createElement('dt');
    const itemValue = document.createElement('dd');

    // 외부 API 값은 HTML 문자열이 아니라 textContent로 안전하게 표시한다.
    item.classList.add('weather-item', 'weather-project');
    itemLabel.textContent = label;
    itemValue.textContent = value;
    item.append(itemLabel, itemValue);

    return item;
}

/**
 * 체감 온도를 기준으로 오늘 입기 좋은 옷을 추천한다.
 * 높은 온도부터 차례대로 비교해 하나의 조건만 선택되도록 구성한다.
 * 사용자가 바로 행동으로 옮길 수 있는 짧고 부드러운 안내 문장을 반환한다.
 */
function getClothingAdvice(weather) {
    const temperature = weather.apparentTemperature;

    // 체감 온도가 높은 구간부터 검사하면 경계값의 의미를 쉽게 확인할 수 있다.
    if (temperature >= 28) {
        return '반팔처럼 가벼운 옷이 좋아요. 햇볕이 강하면 모자도 챙겨주세요.';
    }

    if (temperature >= 23) {
        return '반팔이나 얇은 긴팔이면 충분해요. 가볍게 나들이하기 좋은 온도예요.';
    }

    if (temperature >= 17) {
        return '긴팔이나 얇은 겉옷을 추천해요. 바람이 불면 살짝 서늘할 수 있어요.';
    }

    // 선선하거나 추운 구간에서는 보온 정도를 단계적으로 높인다.
    if (temperature >= 12) {
        return '자켓이나 가벼운 외투를 챙겨주세요. 포근함을 한 겹 더할 시간이에요.';
    }

    if (temperature >= 5) {
        return '코트나 두꺼운 외투가 필요해요. 따뜻함을 단단히 여미고 나가세요.';
    }

    return '패딩이나 겨울 외투를 추천해요. 오늘은 온기를 갑옷처럼 입어주세요.';
}

/**
 * 현재 강수 확률을 네 구간으로 나누어 우산 필요 여부를 알려준다.
 * 가장 높은 확률부터 검사해 70% 이상의 강한 권장 문구를 먼저 적용한다.
 * 단순한 참과 거짓 대신 외출 준비에 바로 활용할 수 있는 문장을 반환한다.
 */
function getUmbrellaAdvice(weather) {
    const probability = weather.precipitationProbability;

    // 비가 올 가능성에 따라 권장 강도를 명확한 네 단계로 구분한다.
    if (probability >= 70) {
        return '우산을 꼭 챙겨주세요. 구름이 빗방울을 떨어뜨릴 준비를 마쳤어요.';
    }

    if (probability >= 50) {
        return '우산을 챙기는 것이 좋아요. 하늘의 마음이 금방 바뀔 수 있어요.';
    }

    if (probability >= 20) {
        return '비가 올 수도 있어요. 오래 외출한다면 작은 우산을 챙겨주세요.';
    }

    return '우산 없이 나가도 괜찮아 보여요. 하늘이 비교적 평온해요.';
}

/**
 * 강수 확률, 풍속, 체감 온도를 차례대로 확인해 야외 활동 가능성을 판정한다.
 * 외출에 더 큰 영향을 주는 비와 강풍을 온도보다 먼저 검사한다.
 * 정밀한 기상 점수 대신 이해하기 쉬운 조건문으로 짧은 안내 문장을 반환한다.
 */
function getOutdoorAdvice(weather) {
    // 가장 주의가 필요한 조건부터 검사해 한 가지 핵심 안내만 보여준다.
    if (weather.precipitationProbability >= 70) {
        return '야외 활동은 잠시 미루는 편이 좋아요. 오늘의 모험은 실내에서 이어가세요.';
    }

    if (weather.windSpeed >= 10) {
        return '바람이 강하게 불어요. 밖에 나간다면 모자와 가벼운 물건을 조심하세요.';
    }

    if (weather.apparentTemperature <= 0) {
        return '매우 춥게 느껴질 수 있어요. 장시간 야외 활동은 피해주세요.';
    }

    // 지나친 더위가 아니라면 일반적인 야외 활동이 가능한 상태로 본다.
    if (weather.apparentTemperature >= 32) {
        return '매우 덥게 느껴질 수 있어요. 짧게 활동하고 자주 쉬어주세요.';
    }

    return '야외 활동을 해도 괜찮아요. 가벼운 마음으로 바깥 공기를 만나보세요.';
}

/**
 * 여러 날씨 조건을 조합해 오늘의 핵심 상태를 한 문장으로 요약한다.
 * 비, 바람, 극한 온도처럼 영향이 큰 조건을 먼저 검사해 우선순위를 분명히 한다.
 * 정보 전달을 해치지 않는 범위에서 동화 같은 표현을 더한 문장을 반환한다.
 */
function getTodayVerdict(weather) {
    // 가장 강한 주의 조건부터 확인해 서로 겹칠 때도 결과를 예측할 수 있게 한다.
    if (weather.precipitationProbability >= 70) {
        return '오늘은 집이 당신을 조금 더 필요로 해요.';
    }

    if (weather.windSpeed >= 10) {
        return '바람 요정이 장난꾸러기예요. 머리 세팅은 잠시 내려놓으세요.';
    }

    if (weather.apparentTemperature <= 0) {
        return '세상이 꽁꽁 얼어붙었어요. 따뜻함을 충분히 챙겨 나가세요.';
    }

    // 더위와 비가 심하지 않을 때는 산책하기 좋은 날인지 추가로 확인한다.
    if (weather.apparentTemperature >= 32) {
        return '태양이 힘을 잔뜩 내고 있어요. 그늘과 물을 가까이하세요.';
    }

    if (weather.precipitationProbability >= 50) {
        return '밖에 나가도 좋아요. 다만 우산 없는 용기는 만용이에요.';
    }

    const isMildTemperature = weather.apparentTemperature >= 17
        && weather.apparentTemperature <= 27;

    if (isMildTemperature && weather.precipitationProbability < 20) {
        return '날씨가 산책을 초대하고 있어요. 집에만 있기엔 조금 아까운 날이에요.';
    }

    return '밖에 나가도 괜찮아요. 오늘의 작은 모험을 시작해보세요.';
}

/**
 * 판정 결과 영역에서 사용하는 제목과 설명을 담은 카드 하나를 생성한다.
 * 카드의 종류를 나타내는 클래스를 받아 파스텔 색상과 크기를 구분할 수 있게 한다.
 * 외부 데이터와 판정 문구는 textContent로 넣고 완성된 DOM 요소를 반환한다.
 */
function createAdviceCard(icon, title, message, cardClass) {
    const card = document.createElement('article');
    const cardHeading = document.createElement('h4');
    const cardMessage = document.createElement('p');

    // 각 카드에 공통 클래스와 역할별 클래스를 함께 적용한다.
    card.classList.add('advice-card', 'weather-project', cardClass);
    cardHeading.textContent = `${icon} ${title}`;
    cardMessage.textContent = message;
    card.append(cardHeading, cardMessage);

    return card;
}

/**
 * 지역 정보와 정리된 현재 날씨 및 네 가지 판정 결과를 화면에 표시한다.
 * 기존 결과를 비운 뒤 현재 날씨 목록과 조언 카드를 DOM API로 직접 생성한다.
 * 위도와 경도도 함께 출력해 지역 검색부터 판정까지의 전체 흐름을 확인하게 한다.
 */
function showWeather(location, weather) {
    const locationParts = [location.name, location.admin1, location.country].filter(Boolean);
    const locationName = [...new Set(locationParts)].join(', ');
    const title = document.createElement('h2');
    const coordinates = document.createElement('p');
    const weatherList = document.createElement('dl');
    const adviceSection = document.createElement('section');
    const adviceTitle = document.createElement('h3');
    const adviceGrid = document.createElement('div');

    // 이전 검색 결과를 제거하고 현재 날씨에 맞는 배경과 기본 정보를 구성한다.
    weatherResult.replaceChildren();
    applyWeatherTheme(weather);
    title.textContent = `📍 ${locationName}`;
    coordinates.classList.add('coordinates');
    coordinates.textContent = `위도 ${location.latitude}, 경도 ${location.longitude}`;
    weatherList.classList.add('weather-list');
    weatherList.append(
        createWeatherItem('🌡 현재 기온', `${weather.temperature}℃`),
        createWeatherItem('🥶 체감 온도', `${weather.apparentTemperature}℃`),
        createWeatherItem('🌧 강수 확률', `${weather.precipitationProbability}%`),
        createWeatherItem('💨 풍속', `${weather.windSpeed}m/s`)
    );

    // 네 판정 함수를 호출해 사용자가 실제로 참고할 수 있는 조언 카드를 만든다.
    adviceSection.classList.add('advice-section');
    adviceTitle.textContent = '오늘의 바깥 이야기';
    adviceGrid.classList.add('advice-grid');
    adviceGrid.append(
        createAdviceCard('👕', '오늘의 복장', getClothingAdvice(weather), 'clothing-card'),
        createAdviceCard('☔', '우산', getUmbrellaAdvice(weather), 'umbrella-card'),
        createAdviceCard('🏃', '야외 활동', getOutdoorAdvice(weather), 'outdoor-card'),
        createAdviceCard('📖', '오늘의 판정', getTodayVerdict(weather), 'verdict-card')
    );

    adviceSection.append(adviceTitle, adviceGrid);
    weatherResult.append(title, coordinates, weatherList, adviceSection);
    weatherResult.hidden = false;
}

/**
 * 검색 과정에서 발생한 오류를 사용자가 이해할 수 있는 문장으로 보여준다.
 * 지역 검색 결과가 없는 경우와 그 밖의 API·네트워크 오류를 구분한다.
 * 실패한 이전 결과를 숨겨 현재 화면 상태와 메시지가 어긋나지 않게 한다.
 */
function showError(error) {
    weatherResult.replaceChildren();
    weatherResult.hidden = true;
    statusMessage.classList.add('error');

    // 내부 오류 코드는 사용자에게 노출하지 않고 친절한 문장으로 변환한다.
    if (error.message === 'LOCATION_NOT_FOUND') {
        statusMessage.textContent = '해당 지역을 찾을 수 없습니다.';
        return;
    }

    statusMessage.textContent = '날씨 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
}

/**
 * 입력값 확인부터 지역 검색, 날씨 조회, 화면 출력까지 전체 순서를 제어한다.
 * 두 비동기 API 작업을 async/await로 차례대로 실행하고 오류를 한곳에서 처리한다.
 * 요청 중에는 중복 제출을 막고 작업이 끝나면 입력과 버튼을 다시 사용할 수 있게 한다.
 */
async function searchWeather() {
    const city = cityInput.value.trim();

    // 빈 입력은 API를 호출하지 않고 입력 요소에서 바로 수정할 수 있게 안내한다.
    if (!city) {
        weatherResult.hidden = true;
        statusMessage.classList.add('error');
        statusMessage.textContent = '지역명을 입력해주세요.';
        cityInput.focus();
        return;
    }

    statusMessage.classList.remove('error');
    statusMessage.textContent = '날씨 정보를 불러오는 중입니다.';
    weatherResult.hidden = true;
    applyWeatherTheme(null);
    searchButton.disabled = true;
    cityInput.disabled = true;

    try {
        // 지역을 좌표로 변환한 뒤 그 좌표를 사용해 현재 날씨를 요청한다.
        const location = await searchLocation(city);
        const weather = await fetchWeather(location.latitude, location.longitude);

        showWeather(location, weather);
        statusMessage.textContent = '';
    } catch (error) {
        console.error('날씨 조회 중 오류가 발생했습니다.', error);
        showError(error);
    } finally {
        // 성공 여부와 관계없이 다음 검색을 할 수 있도록 폼 상태를 복구한다.
        searchButton.disabled = false;
        cityInput.disabled = false;
        cityInput.focus();
    }
}

/**
 * 검색 폼 제출 시 브라우저의 기본 새로고침 동작을 막는다.
 * 현재 입력값을 유지한 상태에서 비동기 날씨 검색 흐름을 시작한다.
 * 버튼 클릭과 Enter 키 제출이 동일한 함수로 처리되도록 연결한다.
 */
weatherForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchWeather();
});
