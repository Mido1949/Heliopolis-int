'use client';

import { useState, useRef, useEffect } from 'react';
import { Typography, Input, Button, Card, Avatar, Spin, Alert, Tag } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

const WELCOME_MSG: Message = {
  id: 'welcome',
  sender: 'ai',
  text: 'مرحبًا! أنا المساعد الذكي لمنصة Loomark 🤖\n\nسيتم تفعيل المساعد الذكي بالكامل فور إتمام عملية "Client Onboarding" وإعداد مفاتيح API الخاصة بك.\n\nيمكنني مساعدتك في:\n• إنشاء عروض أسعار BOQ\n• تحليل بيانات العملاء\n• كتابة رسائل بريد احترافية\n\nكيف يمكنني مساعدتك اليوم؟',
  timestamp: new Date(),
};

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: input.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Mock response for deployment
    await new Promise(r => setTimeout(r, 1000));

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'ai',
      text: `شكرًا لتواصلك! سيتم تفعيل الذكاء الاصطناعي (AI Assistant) فور ربط الحساب خلال عملية الـ Onboarding.\n\nيمكنك حاليًا استخدام أدوات الـ CRM وإدارة المخزون بشكل طبيعي.`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      <div className="flex justify-between items-center mb-4">
        <Title level={4} style={{ margin: 0 }}>المساعد الذكي (AI Assistant)</Title>
        <Tag color="orange">Pending Activation</Tag>
      </div>

      <Alert
        message="AI Assistant will be activated upon client onboarding"
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        className="mb-4 rounded-xl"
      />

      {/* Messages Area */}
      <Card className="flex-1 overflow-hidden" bodyStyle={{ height: '100%', overflowY: 'auto', padding: 16 }}>
        <div className="space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <Avatar
                icon={msg.sender === 'ai' ? <RobotOutlined /> : <UserOutlined />}
                style={{
                  backgroundColor: msg.sender === 'ai' ? '#0D2137' : '#D72B2B',
                  flexShrink: 0,
                }}
              />
              <div className={`max-w-[70%] rounded-xl px-4 py-3 ${
                msg.sender === 'user'
                  ? 'bg-red-50 text-gray-900'
                  : 'bg-gray-50 text-gray-900'
              }`}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</Paragraph>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {msg.timestamp.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-3">
              <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#0D2137', flexShrink: 0 }} />
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <Spin size="small" /> <Text type="secondary">يكتب...</Text>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </Card>

      {/* Input Area */}
      <div className="mt-3 flex gap-2">
        <TextArea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اكتب رسالتك... (Enter للإرسال)"
          autoSize={{ minRows: 1, maxRows: 4 }}
          className="flex-1"
        />
        <Button type="primary" icon={<SendOutlined />} onClick={handleSend}
          disabled={!input.trim() || isTyping}
          style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B', height: 'auto' }}>
          إرسال
        </Button>
      </div>
    </div>
  );
}
