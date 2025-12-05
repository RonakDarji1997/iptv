-- Migration: 001_initial_schema
-- Description: Create initial database schema for IPTV sync backend
-- Date: 2025-12-04

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Subscription Plans table
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    device_limit INTEGER NOT NULL DEFAULT 1,
    concurrent_stream_limit INTEGER NOT NULL DEFAULT 1,
    price_monthly DECIMAL(10, 2),
    price_yearly DECIMAL(10, 2),
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    subscription_plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
    device_limit INTEGER NOT NULL DEFAULT 1,
    concurrent_stream_limit INTEGER NOT NULL DEFAULT 1,
    email_verified BOOLEAN DEFAULT false,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Devices table
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL CHECK (device_type IN ('TV', 'MOBILE', 'WEB', 'TABLET')),
    platform VARCHAR(100),
    app_version VARCHAR(50),
    os_version VARCHAR(50),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, device_id)
);

-- Providers table (synced from Android app)
CREATE TABLE providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('stalker', 'm3u', 'xtream')),
    server_url TEXT,
    mac_address VARCHAR(17),
    serial_number VARCHAR(100),
    token TEXT,
    username VARCHAR(255),
    password VARCHAR(255),
    configuration JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    is_configured BOOLEAN DEFAULT false,
    setup_step INTEGER DEFAULT 0,
    include_tv BOOLEAN DEFAULT true,
    include_vod BOOLEAN DEFAULT true,
    adult_password VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, provider_id)
);

-- Categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    category_id VARCHAR(255) NOT NULL,
    external_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('LIVE', 'MOVIE', 'SERIES')),
    content_type VARCHAR(50),
    censored INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, provider_id, category_id)
);

-- Channels table
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    channel_id VARCHAR(255) NOT NULL,
    external_id VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    number VARCHAR(50),
    url TEXT,
    cmd TEXT,
    logo TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, category_id, channel_id)
);

-- Settings table
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    settings_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id)
);

-- Watch Progress table
CREATE TABLE watch_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('LIVE', 'MOVIE', 'SERIES', 'EPISODE')),
    content_name VARCHAR(255),
    current_position BIGINT NOT NULL DEFAULT 0,
    duration BIGINT NOT NULL DEFAULT 0,
    progress_percentage INTEGER GENERATED ALWAYS AS (
        CASE WHEN duration > 0 THEN (current_position * 100 / duration)::INTEGER ELSE 0 END
    ) STORED,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    last_watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, content_id, content_type)
);

-- Active Sessions table
CREATE TABLE active_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    content_id VARCHAR(255),
    content_type VARCHAR(50) CHECK (content_type IN ('LIVE', 'MOVIE', 'SERIES', 'EPISODE')),
    content_name VARCHAR(255),
    stream_url TEXT,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Refresh Tokens table
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_subscription ON users(subscription_plan_id);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_devices_user_active ON devices(user_id, is_active);
CREATE INDEX idx_devices_last_active ON devices(last_active);

CREATE INDEX idx_providers_user ON providers(user_id);
CREATE INDEX idx_providers_user_active ON providers(user_id, is_active);

CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_categories_provider ON categories(provider_id);
CREATE INDEX idx_categories_user_provider ON categories(user_id, provider_id);

CREATE INDEX idx_channels_user ON channels(user_id);
CREATE INDEX idx_channels_category ON channels(category_id);

CREATE INDEX idx_watch_progress_user ON watch_progress(user_id);
CREATE INDEX idx_watch_progress_content ON watch_progress(content_id, content_type);
CREATE INDEX idx_watch_progress_last_watched ON watch_progress(last_watched_at);

CREATE INDEX idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_device ON active_sessions(device_id);
CREATE INDEX idx_active_sessions_active ON active_sessions(is_active);
CREATE INDEX idx_active_sessions_heartbeat ON active_sessions(last_heartbeat);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_watch_progress_updated_at BEFORE UPDATE ON watch_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, device_limit, concurrent_stream_limit, price_monthly, price_yearly, features) VALUES
('Free', 'Basic plan with single device access', 1, 1, 0.00, 0.00, '["1 Device", "1 Concurrent Stream", "Basic Support"]'::jsonb),
('Premium', 'Premium plan with multiple devices', 3, 2, 9.99, 99.99, '["3 Devices", "2 Concurrent Streams", "Priority Support", "HD Streaming"]'::jsonb),
('Ultimate', 'Ultimate plan with unlimited access', 10, 5, 19.99, 199.99, '["10 Devices", "5 Concurrent Streams", "24/7 Support", "4K Streaming", "Offline Downloads"]'::jsonb);

-- Create view for active user sessions
CREATE VIEW v_active_user_sessions AS
SELECT 
    u.id as user_id,
    u.email,
    u.concurrent_stream_limit,
    COUNT(s.id) as active_stream_count,
    json_agg(
        json_build_object(
            'session_id', s.session_id,
            'device_name', d.device_name,
            'content_name', s.content_name,
            'start_time', s.start_time,
            'last_heartbeat', s.last_heartbeat
        )
    ) as sessions
FROM users u
LEFT JOIN active_sessions s ON u.id = s.user_id AND s.is_active = true
LEFT JOIN devices d ON s.device_id = d.id
GROUP BY u.id, u.email, u.concurrent_stream_limit;

COMMENT ON TABLE users IS 'User accounts with subscription information';
COMMENT ON TABLE devices IS 'Registered devices for each user';
COMMENT ON TABLE providers IS 'IPTV provider configurations synced from devices';
COMMENT ON TABLE categories IS 'Channel categories within providers';
COMMENT ON TABLE channels IS 'Individual channels within categories';
COMMENT ON TABLE active_sessions IS 'Real-time streaming sessions for concurrent stream control';
COMMENT ON TABLE watch_progress IS 'Watch progress for continue watching feature';
COMMENT ON TABLE audit_logs IS 'Audit trail for security and debugging';
