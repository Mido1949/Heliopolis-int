'use client';

import { useState, useRef, useEffect } from 'react';
import { Typography, Input, Button, Card, Avatar, Spin, Tag } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIPage() {
  const { profile } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial greeting
  useEffect(() => {
    if (profile) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `أهلاً ${profile.name}! أنا هيليو — المساعد الذكي لـ HelioMax 🤖\n\nأقدر أساعدك في:\n• تحليل بيانات العملاء والـ pipeline\n• إنشاء رسائل احترافية للعملاء\n• شرح تقنيات HVAC والـ VRF\n• أي سؤال تاني عن الشغل\n\nإيه اللي تحتاجه النهاردة؟`,
        timestamp: new Date(),
      }]);
    }
  }, [profile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setIsTyping(true);

    try {
      const system = `أنت "هيليو"، المساعد الذكي لـ HelioMax — متخصصة في HVAC والتكييف.
تكلمي بالعربية المصرية العامية. ردودك ودية، موجزة، مفيدة (3 جمل بحد أقصى).
اسم المستخدم: ${profile?.name ?? 'زميل'} | دوره: ${profile?.role ?? 'موظف'} | الصفحة: المساعد الذكي.`;

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          system,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content ?? 'عذراً، حصل خطأ!',
        timestamp: new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'عندي مشكلة في الاتصال دلوقتي! 😅',
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
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
        <Tag color="green">Active</Tag>
      </div>

      <Card className="flex-1 overflow-hidden" bodyStyle={{ height: '100%', overflowY: 'auto', padding: 16 }}>
        <div className="space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <Avatar
                icon={msg.role === 'assistant' ? <RobotOutlined /> : <UserOutlined />}
                style={{
                  backgroundColor: msg.role === 'assistant' ? '#0D2137' : '#D72B2B',
                  flexShrink: 0,
                }}
              />
              <div className={`max-w-[70%] rounded-xl px-4 py-3 ${
                msg.role === 'user' ? 'bg-red-50 text-gray-900' : 'bg-gray-50 text-gray-900'
              }`}>
                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</Paragraph>
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
                <Spin size="small" /> <Text type="secondary">هيليو بتفكر...</Text>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </Card>

      <div className="mt-3 flex gap-2">
        <TextArea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اكتب سؤالك... (Enter للإرسال)"
          autoSize={{ minRows: 1, maxRows: 4 }}
          className="flex-1"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
          style={{ backgroundColor: '#D72B2B', borderColor: '#D72B2B', height: 'auto' }}
        >
          إرسال
        </Button>
      </div>
    </div>
  );
}
