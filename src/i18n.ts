import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ja: {
    translation: {
      nav: {
        home: 'ホーム',
        activities: 'ボランティア活動',
        gallery: 'ギャラリー',
        membership: 'ログイン',
        login: 'ログイン',
        logout: 'ログアウト',
        admin: '管理者',
        adminManage: '全て管理',
      },
      hero: {
        tagline: 'WELCOME NEW MEMBER',
        title: 'ボランティア を通じて\n→新しい出会い',
        subtitle: '新しい自分と出会う、コミュニティとつながる',
        ctaPrimary: '今すぐ登録',
        ctaSecondary: '活動を見る',
        scrollDown: 'スクロール',
        clubName: '福祉ボランティア部『ミルクティ』',
        featuredTitle: '注目イベント',
        viewAllLink: 'すべてのイベントを見る →',
        membershipTagline: 'あなたの優しさで、世界をもっと温かく。',
        membershipCta: 'メンバーシップに申し込む',
      },
      activities: {
        title: 'ボランティア活動',
        subtitle: '2025-2026年度の活動を検索・参加する',
        searchPlaceholder: '名前または場所で検索...',
        filterAll: 'すべて',
        filterOpen: '募集中',
        filterClosed: '受付終了',
        members: 'メンバー',
        emptyState: '一致する活動が見つかりません',
        unlimited: '制限なし',
        register: '申し込む',
        deadline: '申込み締切',
        location: '開催場所',
        date: '開催日時',
      },
      auth: {
        loginTitle: 'ログイン',
        systemName: 'サークル管理システム',
        emailLabel: 'メールアドレス',
        passwordLabel: 'パスワード',
        forgotPassword: 'パスワードをお忘れですか？',
        submitLogin: 'ログイン',
        loggingIn: 'ログイン中...',
        loginSuccess: 'ログインに成功しました。',
        loginError: 'ログインに失敗しました。',
        noAccess: 'この学年度へのアクセス権限がありません。管理者にお問い合わせください。',
      }
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ja',
    fallbackLng: 'ja',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
