// PM2 설정 파일: 메모리 및 크래시 방지
module.exports = {
    apps: [{
        name: 'kms',
        script: 'server.js',
        cwd: '/opt/neolab-kms',
        // Node 힙 사이즈: NODE_OPTIONS로 확실히 적용 (node_args는 PM2 버전에 따라 무시됨)
        node_args: ['--max-old-space-size=1536'],
        // 메모리 2GB 초과 시 자동 재시작 (OOM 예방)
        max_memory_restart: '2048M',
        // 비정상 재시작 최소 대기 (연쇄 재시작 방지)
        min_uptime: '10s',
        max_restarts: 20,
        restart_delay: 2000,
        // 로그
        error_file: '/home/ubuntu/.pm2/logs/kms-error.log',
        out_file: '/home/ubuntu/.pm2/logs/kms-out.log',
        merge_logs: true,
        time: true,
        env: {
            NODE_ENV: 'production',
            // NODE_OPTIONS: 가장 확실한 방법으로 힙 사이즈 강제
            NODE_OPTIONS: '--max-old-space-size=1536'
        }
    }]
};
