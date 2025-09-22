/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase 클라이언트는 자격 증명 확인 후 나중에 초기화됩니다.
let supabase: SupabaseClient;
// 'app' 변수는 startApp 함수 내에서 DOM이 로드된 후 초기화됩니다.
let app: HTMLDivElement;


type User = 'jeongwoo' | 'yeonwoo';
type Tab = User | 'admin';

interface CheckItem {
    id: number;
    text: string;
    completed: boolean;
}

interface Submission {
    id: number;
    user: User;
    date: string; // ISO String from Supabase timestamz
    completedTasks: string[];
    allCompleted: boolean;
    rewarded: boolean;
    reward_points: number;
}

interface AppState {
    activeTab: Tab;
    jeongwoo: CheckItem[];
    yeonwoo: CheckItem[];
    submissions: Submission[];
    isAdminAuthenticated: boolean;
    calendarDate: string; // ISO string to easily pass between functions
    selectedDate: string | null; // ISO string date part
    submissionMessage: string | null;
    adminSaveMessage: string | null;
    // New state for rewards
    jeongwooPoints: number;
    yeonwooPoints: number;
    isRewardModalOpen: boolean;
    rewardingSubmission: Submission | null;
    isPointModalOpen: boolean;
    pointModalMode: 'add' | 'subtract' | null;
    pointModalUser: User | null;
    isNavCollapsed: boolean;
}

let state: AppState = getInitialState();

function getInitialState(): AppState {
    const savedAuth = sessionStorage.getItem('isAdminAuthenticated');
    return {
        activeTab: 'jeongwoo',
        jeongwoo: [],
        yeonwoo: [],
        submissions: [],
        isAdminAuthenticated: savedAuth === 'true',
        calendarDate: new Date().toISOString(),
        selectedDate: null,
        submissionMessage: null,
        adminSaveMessage: null,
        jeongwooPoints: 0,
        yeonwooPoints: 0,
        isRewardModalOpen: false,
        rewardingSubmission: null,
        isPointModalOpen: false,
        pointModalMode: null,
        pointModalUser: null,
        isNavCollapsed: window.innerWidth < 768, // 모바일 화면에서는 기본적으로 접힘
    };
}

async function syncDataFromSupabase() {
    console.log('Fetching data from Supabase...');
    try {
        const { data: checklistsData, error: checklistsError } = await supabase
            .from('checklists')
            .select('*')
            .order('task_order');

        if (checklistsError) throw checklistsError;

        const { data: submissionsData, error: submissionsError } = await supabase
            .from('submissions')
            .select('*')
            .order('submission_date', { ascending: false });

        if (submissionsError) throw submissionsError;
        
        state.jeongwoo = checklistsData
            .filter(c => c.user_name === 'jeongwoo')
            .map(c => ({ id: c.id, text: c.task_text, completed: false }));
        
        state.yeonwoo = checklistsData
            .filter(c => c.user_name === 'yeonwoo')
            .map(c => ({ id: c.id, text: c.task_text, completed: false }));

        state.submissions = submissionsData.map(s => ({
            id: s.id,
            user: s.user_name,
            date: s.submission_date,
            completedTasks: s.completed_tasks,
            allCompleted: s.all_completed,
            rewarded: s.rewarded,
            reward_points: s.reward_points || 0,
        }));
        
        // Fetch points from the new 'rewards' table
        const { data: pointsData, error: pointsError } = await supabase
            .from('rewards')
            .select('user_name, total_points');

        if (pointsError) {
            console.error("Could not fetch user points:", pointsError);
        } else {
            // FIX: Sum all points for each user instead of just finding the first entry.
            // This correctly calculates the total score if there are multiple point entries per user.
            state.jeongwooPoints = pointsData
                .filter(p => p.user_name === 'jeongwoo')
                .reduce((sum, record) => sum + (Number(record.total_points) || 0), 0);
            
            state.yeonwooPoints = pointsData
                .filter(p => p.user_name === 'yeonwoo')
                .reduce((sum, record) => sum + (Number(record.total_points) || 0), 0);
        }

    } catch (error: any) {
        console.error("Error fetching data:", error);
        const errorMessage = error.message ? `: ${error.message}` : '. 인터넷 연결을 확인해주세요.';
        alert(`데이터를 불러오는 데 실패했습니다${errorMessage}`);
    }
}

function render() {
    if (!app) return;

    // 네비게이션 상태에 따라 루트 요소에 클래스를 추가합니다.
    app.className = state.isNavCollapsed ? 'nav-collapsed' : '';
    
    const { activeTab, isAdminAuthenticated } = state;

    const mainElement = app.querySelector('main');
    const savedScrollTop = mainElement ? mainElement.scrollTop : 0;

    let content = '';

    if (activeTab === 'jeongwoo' || activeTab === 'yeonwoo') {
        content = renderChecklistView(activeTab);
    } else if (activeTab === 'admin') {
        if (isAdminAuthenticated) {
            content = renderAdminView();
        } else {
            content = renderPasswordModal();
        }
    }

    app.innerHTML = `
        <header>
            <nav>
                <button class="tab ${activeTab === 'jeongwoo' ? 'active' : ''}" data-tab="jeongwoo">
                    <span class="material-symbols-outlined">smart_toy</span>
                    <span class="tab-text">정우의 할 일</span>
                </button>
                <button class="tab ${activeTab === 'yeonwoo' ? 'active' : ''}" data-tab="yeonwoo">
                    <span class="material-symbols-outlined">rocket_launch</span>
                    <span class="tab-text">연우의 할 일</span>
                </button>
                <button class="tab ${activeTab === 'admin' ? 'active' : ''}" data-tab="admin">
                    <span class="material-symbols-outlined">admin_panel_settings</span>
                    <span class="tab-text">관리자</span>
                </button>
            </nav>
        </header>
        <div class="content-wrapper">
            <button id="nav-toggle" aria-label="네비게이션 토글" title="네비게이션 토글">
                <span class="material-symbols-outlined">
                    ${state.isNavCollapsed ? 'chevron_right' : 'chevron_left'}
                </span>
            </button>
            <div id="quick-nav" aria-label="빠른 탐색">
                <button class="mobile-tab-shortcut ${state.activeTab === 'jeongwoo' ? 'active' : ''}" data-tab="jeongwoo" aria-label="정우의 할 일" title="정우의 할 일">
                    <span class="material-symbols-outlined">smart_toy</span>
                </button>
                <button class="mobile-tab-shortcut ${state.activeTab === 'yeonwoo' ? 'active' : ''}" data-tab="yeonwoo" aria-label="연우의 할 일" title="연우의 할 일">
                    <span class="material-symbols-outlined">rocket_launch</span>
                </button>
                <button class="mobile-tab-shortcut ${state.activeTab === 'admin' ? 'active' : ''}" data-tab="admin" aria-label="관리자" title="관리자">
                    <span class="material-symbols-outlined">admin_panel_settings</span>
                </button>
            </div>
            ${content}
        </div>
        <div class="fireworks-container"></div>
        ${state.isRewardModalOpen ? renderRewardModal() : ''}
        ${state.isPointModalOpen ? renderPointAdjustModal() : ''}
    `;

    addEventListeners();

    const newMainElement = app.querySelector('main');
    if (newMainElement) {
        newMainElement.scrollTop = savedScrollTop;
    }

    if (activeTab === 'jeongwoo' || activeTab === 'yeonwoo') {
         if (areAllTasksCompleted(activeTab)) {
            triggerFireworks();
         }
    }
}

function renderConfigurationScreen(): string {
    return `
        <div class="content-wrapper">
            <main class="setup-modal">
                <h1>앱 설정</h1>
                <p>미리보기 환경에서 Supabase에 연결하려면 URL과 익명 키(anon key)를 입력해주세요.</p>
                <form id="config-form">
                    <input type="text" id="supabase-url-input" required placeholder="Supabase URL" />
                    <input type="password" id="supabase-key-input" required placeholder="Supabase Anon Key" />
                    <button type="submit">연결</button>
                </form>
                <p class="setup-note">이 정보는 브라우저 세션에만 저장되며 코드에 남지 않습니다.</p>
            </main>
        </div>
    `;
}

function addConfigurationEventListeners() {
    const configForm = document.getElementById('config-form');
    if (configForm) {
        configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const urlInput = document.getElementById('supabase-url-input') as HTMLInputElement;
            const keyInput = document.getElementById('supabase-key-input') as HTMLInputElement;
            
            const supabaseUrl = urlInput.value.trim();
            const supabaseKey = keyInput.value.trim();

            if (supabaseUrl && supabaseKey) {
                sessionStorage.setItem('supabaseUrl', supabaseUrl);
                sessionStorage.setItem('supabaseKey', supabaseKey);
                // Supabase를 초기화하고 메인 앱 로직을 시작합니다.
                supabase = createClient(supabaseUrl, supabaseKey);
                initializeApp();
            } else {
                alert("URL과 Key를 모두 입력해야 합니다.");
            }
        });
    }
}

function renderPasswordModal(): string {
    return `
        <main class="password-modal">
            <h1>관리자 접근</h1>
            <p>비밀번호를 입력하세요.</p>
            <form id="password-form">
                <input type="password" id="password-input" required placeholder="비밀번호" />
                <button type="submit">확인</button>
            </form>
            <p id="password-error" class="error-message" style="display: none;">비밀번호가 틀렸습니다.</p>
        </main>
    `;
}

function getFormattedDate(dateString?: string): string {
    const date = dateString ? new Date(dateString) : new Date();
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' };
    if (dateString && dateString.length === 10) {
        const [year, month, day] = dateString.split('-').map(Number);
        const localDate = new Date(year, month - 1, day);
        return new Intl.DateTimeFormat('ko-KR', options).format(localDate);
    }
    return new Intl.DateTimeFormat('ko-KR', options).format(date);
}

/**
 * Returns a date string in 'YYYY-MM-DD' format based on the local timezone.
 * @param date The date object to format.
 * @returns The formatted date string.
 */
function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


function renderChecklistView(user: User): string {
    const list = state[user];
    const title = user === 'jeongwoo' ? "정우의 오늘 할 일!" : "연우의 오늘 할 일!";
    const today = getLocalDateString(new Date());
    const submissionToday = state.submissions.find(s => {
        if (s.user !== user) return false;
        const submissionDate = new Date(s.date);
        return getLocalDateString(submissionDate) === today;
    });
    const hasSubmittedToday = !!submissionToday;

    const itemsToShow = hasSubmittedToday 
        ? list.map(item => ({
            ...item,
            completed: submissionToday.completedTasks.includes(item.text)
        }))
        : list;

    const completedCount = itemsToShow.filter(item => item.completed).length;
    const totalCount = itemsToShow.length;
    const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    const points = user === 'jeongwoo' ? state.jeongwooPoints : state.yeonwooPoints;

    return `
        <main>
             ${state.submissionMessage ? `<div class="success-message">${state.submissionMessage}</div>` : ''}
             <div class="checklist-header">
                <div class="checklist-header-top">
                    <p class="current-date">${getFormattedDate()}</p>
                    <div class="points-display-user">
                        <span class="material-symbols-outlined">favorite</span>
                        <span>${points}</span>
                    </div>
                </div>
                <h1>${title}</h1>
            </div>
             <div class="progress-container">
                <div class="progress-circle" style="--progress: ${percentage}">
                    <span class="progress-text">${Math.round(percentage)}%</span>
                </div>
            </div>
            <div class="checklist">
                ${itemsToShow.map(item => `
                    <div class="check-item ${item.completed ? 'completed' : ''} ${hasSubmittedToday ? 'disabled' : ''}" data-user="${user}" data-id="${item.id}">
                        <span class="check-item-text">${item.text}</span>
                        <span class="completed-badge">완료!</span>
                    </div>
                `).join('')}
            </div>
        </main>
        <footer>
            ${areAllTasksCompleted(user) && !hasSubmittedToday ? `<div class="completion-message">모든 미션을 완료했어요! 정말 대단해요!</div>` : ''}
            <button class="submit-btn" data-user="${user}" ${hasSubmittedToday ? 'disabled' : ''}>
                ${hasSubmittedToday ? '제출 완료' : '오늘의 미션 완료!'}
            </button>
        </footer>
    `;
}

function renderAdminView(): string {
    const submissionsOnSelectedDate = state.selectedDate
        ? state.submissions.filter(s => {
            const submissionDate = new Date(s.date);
            return getLocalDateString(submissionDate) === state.selectedDate;
        })
        : [];

    // Calculate Stats
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const submissionsThisMonth = state.submissions.filter(s => {
        const subDate = new Date(s.date);
        return subDate.getFullYear() === currentYear && subDate.getMonth() === currentMonth;
    });

    const jeongwooSubmissionsThisMonth = submissionsThisMonth.filter(s => s.user === 'jeongwoo').length;
    const yeonwooSubmissionsThisMonth = submissionsThisMonth.filter(s => s.user === 'yeonwoo').length;
    
    const jeongwooAllCompletedCount = state.submissions.filter(s => s.user === 'jeongwoo' && s.allCompleted).length;
    const jeongwooTotalSubmissions = state.submissions.filter(s => s.user === 'jeongwoo').length;
    const jeongwooCompletionRate = jeongwooTotalSubmissions > 0 ? Math.round((jeongwooAllCompletedCount / jeongwooTotalSubmissions) * 100) : 0;
    
    const yeonwooAllCompletedCount = state.submissions.filter(s => s.user === 'yeonwoo' && s.allCompleted).length;
    const yeonwooTotalSubmissions = state.submissions.filter(s => s.user === 'yeonwoo').length;
    const yeonwooCompletionRate = yeonwooTotalSubmissions > 0 ? Math.round((yeonwooAllCompletedCount / yeonwooTotalSubmissions) * 100) : 0;


    return `
        <main class="admin-main">
            ${state.adminSaveMessage ? `<div class="success-message">${state.adminSaveMessage}</div>` : ''}
            <h1>관리자 대시보드</h1>
            <div class="admin-panel">
                <div class="admin-card full-width">
                     <h2>이번 달 통계</h2>
                     <div class="stats-container">
                        <div class="stat-item">
                            <h3>정우 월간 제출</h3>
                            <p>${jeongwooSubmissionsThisMonth}회</p>
                            <small>전체 성공률: ${jeongwooCompletionRate}%</small>
                        </div>
                        <div class="stat-item">
                            <h3>연우 월간 제출</h3>
                            <p>${yeonwooSubmissionsThisMonth}회</p>
                            <small>전체 성공률: ${yeonwooCompletionRate}%</small>
                        </div>
                     </div>
                </div>
                <div class="admin-card">
                    <div class="admin-section">
                         <div class="admin-section-header">
                            <h2>정우의 할 일</h2>
                            <div class="points-display admin">
                                <button class="point-adjust-btn add" data-user="jeongwoo" aria-label="점수 더하기">
                                    <span class="material-symbols-outlined">add</span>
                                </button>
                                <div class="points-value">
                                    <span class="material-symbols-outlined">favorite</span>
                                    <span>${state.jeongwooPoints}</span>
                                </div>
                                <button class="point-adjust-btn subtract" data-user="jeongwoo" aria-label="점수 빼기">
                                    <span class="material-symbols-outlined">remove</span>
                                </button>
                            </div>
                        </div>
                        <textarea id="jeongwoo-editor">${state.jeongwoo.map(i => i.text).join('\n')}</textarea>
                        <button class="save-btn" data-user="jeongwoo">저장</button>
                    </div>
                </div>
                <div class="admin-card">
                    <div class="admin-section">
                        <div class="admin-section-header">
                            <h2>연우의 할 일</h2>
                            <div class="points-display admin">
                                <button class="point-adjust-btn add" data-user="yeonwoo" aria-label="점수 더하기">
                                    <span class="material-symbols-outlined">add</span>
                                </button>
                                <div class="points-value">
                                    <span class="material-symbols-outlined">favorite</span>
                                    <span>${state.yeonwooPoints}</span>
                                </div>
                                <button class="point-adjust-btn subtract" data-user="yeonwoo" aria-label="점수 빼기">
                                    <span class="material-symbols-outlined">remove</span>
                                </button>
                            </div>
                        </div>
                        <textarea id="yeonwoo-editor">${state.yeonwoo.map(i => i.text).join('\n')}</textarea>
                        <button class="save-btn" data-user="yeonwoo">저장</button>
                    </div>
                </div>
                <div class="admin-card full-width">
                    <h2>제출 기록</h2>
                    ${renderCalendar()}
                    <div class="submission-details">
                        ${state.selectedDate ? `<h3>${getFormattedDate(state.selectedDate)} 기록</h3>` : '<h3>날짜를 선택하여 기록을 확인하세요.</h3>'}
                        ${submissionsOnSelectedDate.length > 0 ? `
                            <ul class="submissions-list">
                                ${submissionsOnSelectedDate.map(s => `
                                    <li class="submission-item">
                                        <div>
                                            <strong>${s.user === 'jeongwoo' ? '정우' : '연우'}</strong> 님 제출 
                                            <small>(${new Date(s.date).toLocaleTimeString('ko-KR')})</small>
                                            <br>완료 항목: ${s.completedTasks.length > 0 ? s.completedTasks.join(', ') : '없음'}
                                        </div>
                                        <div class="submission-controls">
                                            ${s.rewarded 
                                                ? `<button class="reward-btn" disabled>보상완료 (+${s.reward_points})</button>`
                                                : `<button class="reward-btn" data-submission-id="${s.id}">보상</button>`
                                            }
                                            <span class="status-badge ${s.allCompleted ? 'status-completed' : 'status-incomplete'}">
                                                ${s.allCompleted ? '모두 완료' : '일부 완료'}
                                            </span>
                                            <button class="admin-reset-btn" data-submission-id="${s.id}">삭제</button>
                                        </div>
                                    </li>
                                `).join('')}
                            </ul>` 
                        : (state.selectedDate ? '<p>해당 날짜에 제출된 기록이 없습니다.</p>' : '')}
                    </div>
                </div>
            </div>
        </main>
    `;
}

function renderCalendar(): string {
    const calendarDate = new Date(state.calendarDate);
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const submissionsByDate = state.submissions.reduce((acc, s) => {
        const submissionDate = new Date(s.date);
        const dateKey = getLocalDateString(submissionDate);
        acc[dateKey] = true;
        return acc;
    }, {} as Record<string, boolean>);

    let daysHtml = Array.from({ length: firstDay }, () => '<div></div>').join('');
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasSubmission = submissionsByDate[dateKey];
        const isSelected = state.selectedDate === dateKey;
        daysHtml += `
            <div class="calendar-day ${isSelected ? 'selected' : ''}" data-date="${dateKey}">
                <span class="day-number">${day}</span>
                ${hasSubmission ? '<span class="submission-dot"></span>' : ''}
            </div>
        `;
    }

    return `
        <div class="calendar-container">
            <div class="calendar-header">
                <button id="prev-month" aria-label="Previous month"><span class="material-symbols-outlined">chevron_left</span></button>
                <h2>${year}년 ${month + 1}월</h2>
                <button id="next-month" aria-label="Next month"><span class="material-symbols-outlined">chevron_right</span></button>
            </div>
            <div class="calendar-weekdays">
                <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
            </div>
            <div class="calendar-grid">
                ${daysHtml}
            </div>
        </div>
    `;
}

function renderRewardModal(): string {
    if (!state.rewardingSubmission) return '';
    const user = state.rewardingSubmission.user === 'jeongwoo' ? '정우' : '연우';
    return `
        <div class="modal-overlay" id="reward-modal-overlay">
            <div class="modal">
                <h2>${user}님 보상 주기</h2>
                <p>보상으로 지급할 하트 개수를 선택하세요.</p>
                <div class="reward-options">
                    ${[1, 2, 3, 4, 5].map(points => `
                        <button class="reward-option" data-points="${points}">
                            <span class="material-symbols-outlined">favorite</span>
                            <span>${points}</span>
                        </button>
                    `).join('')}
                </div>
                <button class="modal-close-btn" id="reward-modal-close">닫기</button>
            </div>
        </div>
    `;
}

function renderPointAdjustModal(): string {
    if (!state.pointModalUser || !state.pointModalMode) return '';
    const user = state.pointModalUser === 'jeongwoo' ? '정우' : '연우';
    const actionText = state.pointModalMode === 'add' ? '더할' : '뺄';
    return `
        <div class="modal-overlay" id="point-modal-overlay">
            <div class="modal">
                <h2>${user}님 점수 조정</h2>
                <p>${actionText} 점수를 입력하세요.</p>
                <form id="point-adjust-form">
                    <input type="number" id="point-input" required min="1" placeholder="점수" />
                    <button type="submit">확인</button>
                </form>
                <button class="modal-close-btn" id="point-modal-close">닫기</button>
            </div>
        </div>
    `;
}

function addEventListeners() {
    app.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = (e.currentTarget as HTMLElement).dataset.tab as Tab;
            if (targetTab) {
                state.activeTab = targetTab;
                render();
            }
        });
    });

    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', e => {
            e.preventDefault();
            const passwordInput = document.getElementById('password-input') as HTMLInputElement;
            const passwordError = document.getElementById('password-error') as HTMLParagraphElement;
            if (passwordInput.value === 'admin23!') {
                state.isAdminAuthenticated = true;
                sessionStorage.setItem('isAdminAuthenticated', 'true');
                render();
            } else {
                passwordError.style.display = 'block';
                passwordInput.value = '';
            }
        });
    }

    app.querySelectorAll('.check-item:not(.disabled)').forEach(item => {
        item.addEventListener('click', (e) => {
            const { user, id } = (e.currentTarget as HTMLElement).dataset;
            if (user && id) {
                toggleCheckItem(user as User, parseInt(id, 10));
            }
        });
    });
    
    const submitBtn = app.querySelector('.submit-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            const user = (e.currentTarget as HTMLElement).dataset.user as User;
            handleSubmit(user);
        });
    }

    app.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const user = (e.currentTarget as HTMLElement).dataset.user as User;
            const editor = document.getElementById(`${user}-editor`) as HTMLTextAreaElement;
            const newTasks = editor.value.split('\n').map(text => text.trim()).filter(text => text.length > 0);
            
            const saveButton = e.currentTarget as HTMLButtonElement;
            saveButton.disabled = true;
            saveButton.textContent = '저장 중...';

            try {
                const { error: deleteError } = await supabase.from('checklists').delete().eq('user_name', user);
                if (deleteError) {
                    throw deleteError;
                }

                if (newTasks.length > 0) {
                    // FIX: The 'checklists' table is for task templates and does not have a 'completed' column.
                    // Removing this field from the insert payload resolves the database error.
                    const tasksToInsert = newTasks.map((text, index) => ({
                        user_name: user,
                        task_text: text,
                        task_order: index + 1,
                    }));
                    const { error: insertError } = await supabase.from('checklists').insert(tasksToInsert);
                    if (insertError) {
                        throw insertError;
                    }
                }

                // Success case
                state.adminSaveMessage = '저장이 완료되었습니다.';
                await syncDataFromSupabase();
                render();
                setTimeout(() => {
                    state.adminSaveMessage = null;
                    render();
                }, 3000);

            } catch (error: any) {
                // Error case
                console.error(`Error saving checklist for ${user}:`, error);
                alert(`저장에 실패했습니다: ${error.message}`);
                // Re-enable the button on failure
                saveButton.disabled = false;
                saveButton.textContent = '저장';
            }
        });
    });

    app.querySelectorAll('.admin-reset-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const id = (e.currentTarget as HTMLElement).dataset.submissionId;
            if (id) {
                handleAdminReset(parseInt(id, 10));
            }
        });
    });

    app.querySelectorAll('.reward-btn:not(:disabled)').forEach(btn => {
        btn.addEventListener('click', e => {
            const id = (e.currentTarget as HTMLElement).dataset.submissionId;
            if (id) {
                handleOpenRewardModal(parseInt(id, 10));
            }
        });
    });
    
    // Reward modal listeners
    const rewardModalOverlay = document.getElementById('reward-modal-overlay');
    if (rewardModalOverlay) {
        rewardModalOverlay.addEventListener('click', (e) => {
            if (e.target === rewardModalOverlay) handleCloseModals();
        });
        document.getElementById('reward-modal-close')?.addEventListener('click', handleCloseModals);
        app.querySelectorAll('.reward-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const points = (e.currentTarget as HTMLElement).dataset.points;
                if (points) {
                    handleApplyReward(parseInt(points, 10));
                }
            });
        });
    }

    // Point adjust listeners
    app.querySelectorAll('.point-adjust-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const user = (e.currentTarget as HTMLElement).dataset.user as User;
            const mode = (e.currentTarget as HTMLElement).classList.contains('add') ? 'add' : 'subtract';
            handleOpenPointModal(user, mode);
        });
    });
    const pointModalOverlay = document.getElementById('point-modal-overlay');
    if (pointModalOverlay) {
        pointModalOverlay.addEventListener('click', (e) => {
            if (e.target === pointModalOverlay) handleCloseModals();
        });
        document.getElementById('point-modal-close')?.addEventListener('click', handleCloseModals);
        document.getElementById('point-adjust-form')?.addEventListener('submit', handleManualPointUpdate);
    }


    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    if (prevMonthBtn && nextMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            const newDate = new Date(state.calendarDate);
            newDate.setMonth(newDate.getMonth() - 1);
            state.calendarDate = newDate.toISOString();
            render();
        });
        nextMonthBtn.addEventListener('click', () => {
            const newDate = new Date(state.calendarDate);
            newDate.setMonth(newDate.getMonth() + 1);
            state.calendarDate = newDate.toISOString();
            render();
        });
    }
    app.querySelectorAll('.calendar-day').forEach(day => {
        day.addEventListener('click', e => {
            const date = (e.currentTarget as HTMLElement).dataset.date;
            if (date) {
                state.selectedDate = state.selectedDate === date ? null : date;
                render();
            }
        });
    });

    const navToggle = document.getElementById('nav-toggle');
    if (navToggle) {
        navToggle.addEventListener('click', () => {
            state.isNavCollapsed = !state.isNavCollapsed;
            render();
        });
    }

    app.querySelectorAll('.mobile-tab-shortcut').forEach(button => {
        button.addEventListener('click', (e) => {
            const targetTab = (e.currentTarget as HTMLElement).dataset.tab as Tab;
            if (targetTab) {
                state.activeTab = targetTab;
                render();
            }
        });
    });
}

function toggleCheckItem(user: User, id: number) {
    const item = state[user].find(i => i.id === id);
    if (item) {
        item.completed = !item.completed;
        render(); // Optimistic UI update
    }
}

function areAllTasksCompleted(user: User): boolean {
    return state[user].length > 0 && state[user].every(item => item.completed);
}

async function handleSubmit(user: User) {
    const submitBtn = document.querySelector(`.submit-btn[data-user="${user}"]`) as HTMLButtonElement | null;
    if (!submitBtn || submitBtn.disabled) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '제출 중...';

    const allCompleted = areAllTasksCompleted(user);
    const completedTasks = state[user].filter(item => item.completed).map(item => item.text);

    try {
        const { error } = await supabase
            .from('submissions')
            .insert({
                user_name: user,
                submission_date: new Date().toISOString(),
                completed_tasks: completedTasks,
                all_completed: allCompleted,
                rewarded: false,
                reward_points: 0,
            });

        if (error) {
            throw error;
        }
        
        state.submissionMessage = '제출이 완료되었습니다.';
        await syncDataFromSupabase(); 
        render();
        
        setTimeout(() => {
            state.submissionMessage = null;
            render();
        }, 3000);

    } catch (err: any) {
        console.error('제출 오류:', err);
        alert(`제출에 실패했습니다: ${err.message}`);
        
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '오늘의 미션 완료!';
        }
    }
}

async function handleAdminReset(submissionId: number) {
    const submissionToDelete = state.submissions.find(s => s.id === submissionId);
    if (!submissionToDelete) {
        alert('삭제할 제출 기록을 찾을 수 없습니다.');
        console.error(`Submission with ID ${submissionId} not found in state.`);
        return;
    }

    const { user, reward_points } = submissionToDelete;

    try {
        // If the submission had points awarded, deduct them from the user's total.
        if (reward_points > 0) {
            const { data: currentRewardData, error: fetchError } = await supabase
                .from('rewards')
                .select('total_points')
                .eq('user_name', user)
                .single();

            if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116: 0 rows, which is okay.
                throw new Error(`사용자의 현재 포인트를 불러오지 못했습니다: ${fetchError.message}`);
            }

            const currentPoints = Number(currentRewardData?.total_points) || 0;
            const newPoints = currentPoints - reward_points; // Allow negative points

            const { error: updateError } = await supabase
                .from('rewards')
                .upsert({ user_name: user, total_points: newPoints });
            
            if (updateError) {
                throw new Error(`포인트 차감에 실패했습니다: ${updateError.message}`);
            }
        }

        // After successfully handling points, delete the submission record.
        const { error: deleteError } = await supabase
            .from('submissions')
            .delete()
            .eq('id', submissionId);

        if (deleteError) {
            // This is tricky. The points were deducted but the submission wasn't deleted.
            // For now, we'll just alert the user. A more robust solution might involve transactions.
            throw new Error(`제출 기록 삭제에 실패했습니다: ${deleteError.message}. 포인트는 이미 차감되었을 수 있습니다. 새로고침 후 확인해주세요.`);
        }
        
        console.log(`Successfully deleted submission ID: ${submissionId} and adjusted points.`);

    } catch (error: any) {
        alert(error.message);
    } finally {
        // Always refresh data from Supabase to ensure UI is consistent.
        await syncDataFromSupabase();
        render();
    }
}

function handleCloseModals() {
    state.isRewardModalOpen = false;
    state.rewardingSubmission = null;
    state.isPointModalOpen = false;
    state.pointModalUser = null;
    state.pointModalMode = null;
    render();
}

function handleOpenRewardModal(submissionId: number) {
    const submission = state.submissions.find(s => s.id === submissionId);
    if (submission) {
        state.rewardingSubmission = submission;
        state.isRewardModalOpen = true;
        render();
    }
}

async function handleApplyReward(points: number) {
    if (!state.rewardingSubmission) return;

    const { user, id } = state.rewardingSubmission;

    // First, update the submission record to mark it as rewarded
    const { error: submissionError } = await supabase
        .from('submissions')
        .update({ rewarded: true, reward_points: points })
        .eq('id', id);

    if (submissionError) {
        alert(`제출 기록 업데이트에 실패했습니다: ${submissionError.message}`);
        handleCloseModals();
        return;
    }

    // Then, update the points in the 'rewards' table.
    // The RPC function 'add_points' was replaced with a direct update
    // to resolve an issue where points were not being added.
    const { data: currentRewardData, error: fetchError } = await supabase
        .from('rewards')
        .select('total_points')
        .eq('user_name', user)
        .single();
    
    // PGRST116: "The result contains 0 rows" - this is fine, means user has 0 points.
    if (fetchError && fetchError.code !== 'PGRST116') {
        alert(`포인트 조회에 실패했습니다: ${fetchError.message}`);
        handleCloseModals();
        return;
    }
    
    const currentPoints = Number(currentRewardData?.total_points) || 0;
    const newPoints = currentPoints + points;

    const { error } = await supabase
        .from('rewards')
        .upsert({ user_name: user, total_points: newPoints });
    
    if (error) {
        alert(`포인트 업데이트에 실패했습니다: ${error.message}`);
        handleCloseModals();
        return;
    }
    
    // Both DB updates successful. Close modal, refetch all data, and re-render.
    handleCloseModals();
    await syncDataFromSupabase();
    render();
}

function handleOpenPointModal(user: User, mode: 'add' | 'subtract') {
    state.pointModalUser = user;
    state.pointModalMode = mode;
    state.isPointModalOpen = true;
    render();
}

async function handleManualPointUpdate(e: Event) {
    e.preventDefault();
    if (!state.pointModalUser || !state.pointModalMode) return;

    const input = document.getElementById('point-input') as HTMLInputElement;
    const amount = parseInt(input.value, 10);
    if (isNaN(amount) || amount <= 0) {
        alert("유효한 숫자를 입력하세요.");
        return;
    }

    const user = state.pointModalUser;
    const mode = state.pointModalMode;
    
    // Fetch current points to perform the update on the client side,
    // as the RPC functions seem to be unavailable or misconfigured.
    const { data: currentRewardData, error: fetchError } = await supabase
        .from('rewards')
        .select('total_points')
        .eq('user_name', user)
        .single();
    
    // PGRST116: "The result contains 0 rows" - this is fine, means user has 0 points.
    if (fetchError && fetchError.code !== 'PGRST116') {
        alert(`포인트 조회에 실패했습니다: ${fetchError.message}`);
        handleCloseModals();
        return;
    }

    const currentPoints = Number(currentRewardData?.total_points) || 0;
    const newPoints = mode === 'add' 
        ? currentPoints + amount 
        : currentPoints - amount; // Allow negative points

    const { error } = await supabase
        .from('rewards')
        .upsert({ user_name: user, total_points: newPoints });

    if (error) {
        alert(`포인트 업데이트에 실패했습니다: ${error.message}`);
        handleCloseModals();
        return;
    }

    // DB update successful. Close modal, refetch, and re-render for consistency.
    handleCloseModals();
    await syncDataFromSupabase();
    render();
}

function triggerFireworks() {
    const container = document.querySelector('.fireworks-container') as HTMLElement;
    if (!container) return;

    container.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        setTimeout(() => {
            const firework = document.createElement('div');
            firework.className = 'firework';
            const x = Math.random() * container.offsetWidth;
            const y = Math.random() * container.offsetHeight;
            const hue = Math.random() * 360;
            firework.style.left = `${x}px`;
            firework.style.top = `${y}px`;
            firework.style.setProperty('--hue', hue.toString());
            container.appendChild(firework);
            
            setTimeout(() => {
                firework.remove();
            }, 1200);
        }, Math.random() * 800);
    }
}

function setupRealtimeSubscriptions() {
    const channel = supabase.channel('db-changes');
    channel
        .on(
            'postgres_changes',
            { event: '*', schema: 'public' }, // Listen to all tables
            async (payload) => {
                console.log('Database change received!', payload);
                // To prevent race conditions with manual updates, we refetch data
                // after every manual action. The real-time is a good fallback.
                await syncDataFromSupabase();
                render();
            }
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('Successfully subscribed to real-time updates!');
            }
            if (status === 'CHANNEL_ERROR') {
                console.error('Real-time subscription error:', err);
            }
        });
}

async function initializeApp() {
    app.innerHTML = `<div class="content-wrapper"><main style="display:flex;justify-content:center;align-items:center;height:100%;"><h1 style="font-size: 1.5rem; color: #6c757d;">데이터를 불러오는 중입니다...</h1></main></div>`;
    await syncDataFromSupabase();
    render();
    setupRealtimeSubscriptions();
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

// 앱 시작을 위한 메인 진입점
function startApp() {
    // DOM이 로드된 후에 #app 요소를 안전하게 찾습니다.
    app = document.getElementById('app') as HTMLDivElement;
    if (!app) {
        console.error('Fatal: #app element not found in the DOM.');
        return;
    }

    // 디버깅: Vercel 환경 변수가 제대로 주입되었는지 확인합니다.
    console.log("Vercel 환경 변수 확인:");
    console.log("VITE_SUPABASE_URL:", (import.meta as any)?.env?.VITE_SUPABASE_URL);
    console.log("VITE_SUPABASE_KEY:", (import.meta as any)?.env?.VITE_SUPABASE_KEY ? "설정됨 (보안을 위해 값은 출력하지 않음)" : "설정되지 않음");


    const supabaseUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL || sessionStorage.getItem('supabaseUrl');
    const supabaseKey = (import.meta as any)?.env?.VITE_SUPABASE_KEY || sessionStorage.getItem('supabaseKey');

    if (supabaseUrl && supabaseKey) {
        // 자격 증명이 있으면 앱을 바로 초기화합니다.
        supabase = createClient(supabaseUrl, supabaseKey);
        initializeApp();
    } else {
        // 자격 증명이 없으면, 설정 화면을 직접 렌더링합니다.
        // 이렇게 하면 메인 render() 함수와 책임이 분리되어 코드가 더 명확해집니다.
        app.innerHTML = renderConfigurationScreen();
        addConfigurationEventListeners();
    }
}

// DOM이 완전히 로드된 후에 앱을 시작하여, 스크립트가 #app 요소를 찾지 못하는 문제를 방지합니다.
window.addEventListener('DOMContentLoaded', startApp);