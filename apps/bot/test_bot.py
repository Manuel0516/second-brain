"""Stdlib-only checks for bot.py's pure text-formatting logic (no network)."""

import json
import os
import sys
import unittest
import urllib.error
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")

import bot  # noqa: E402


class BotFlowTests(unittest.TestCase):
    def setUp(self):
        bot._state = {}

    @patch.object(bot, "tg_send")
    def test_confirmation_uses_confirm_callback(self, send):
        bot.deliver_events(
            1,
            "conversation-1",
            [
                {
                    "type": "confirm_required",
                    "action_id": "action-1",
                    "tool": "create_page",
                    "preview": {"title": "Draft"},
                }
            ],
        )
        markup = send.call_args.kwargs["reply_markup"]
        self.assertEqual(markup["inline_keyboard"][0][0]["callback_data"], "confirm:action-1")

    @patch.object(bot, "tg_send")
    def test_secure_action_hands_off_to_web(self, send):
        bot.deliver_events(
            1,
            "conversation-1",
            [
                {
                    "type": "confirm_required",
                    "action_id": "action-1",
                    "tool": "login",
                    "preview": {"_secure_fields": ["password"]},
                }
            ],
        )
        text = send.call_args.args[1]
        self.assertIn("/calendar?assistant=conversation-1&action=action-1", text)
        self.assertNotIn("password", text)
        self.assertNotIn("reply_markup", send.call_args.kwargs)

    @patch.object(bot, "tg_send")
    def test_high_risk_confirmation_uses_single_apply_button(self, send):
        bot.deliver_events(
            1,
            "conversation-1",
            [
                {
                    "type": "confirm_required",
                    "action_id": "action-1",
                    "tool": "danger",
                    "preview": {},
                    "confirmation": 1,
                }
            ],
        )
        self.assertIn("Approve or reject", send.call_args.args[1])
        self.assertEqual(
            send.call_args.kwargs["reply_markup"]["inline_keyboard"][0][0]["callback_data"],
            "confirm:action-1",
        )

    @patch.object(bot, "tg_send")
    def test_assistant_answer_is_sent_once(self, send):
        bot.deliver_events(
            1,
            "conversation-1",
            [{"type": "text_delta", "content": "Done"}, {"type": "done"}],
        )
        send.assert_called_once_with(1, "Done", markdown=False)

    @patch.object(bot, "tg_send")
    def test_tool_names_are_sent_as_plain_text(self, send):
        bot.deliver_events(
            1,
            "conversation-1",
            [{"type": "tool_call", "name": "search_pages"}, {"type": "done"}],
        )
        send.assert_called_once_with(1, "🔧 search_pages", markdown=False)

    @patch.object(bot, "tg_call")
    def test_markdown_parse_failure_retries_as_plain_text(self, tg_call):
        tg_call.side_effect = [
            urllib.error.HTTPError("url", 400, "Bad Request", {}, None),
            {"ok": True},
        ]
        bot.tg_send(1, "search_pages")
        self.assertEqual(tg_call.call_count, 2)
        self.assertEqual(tg_call.call_args_list[0].kwargs["parse_mode"], "Markdown")
        self.assertNotIn("parse_mode", tg_call.call_args_list[1].kwargs)

    @patch.object(bot, "deliver_events")
    @patch.object(bot, "tg_call")
    @patch.object(bot, "api_stream", return_value=iter(()))
    def test_callback_posts_to_confirm_route(self, stream, tg_call, deliver):
        bot._state = {"1": {"token": "token", "conv_id": "conversation-1"}}
        bot.handle_callback(1, "callback-1", "confirm:action-1")
        self.assertEqual(stream.call_args.args[1], "/api/ai/conversations/conversation-1/confirm")
        deliver.assert_called_once()

    @patch.object(bot, "tg_call")
    @patch.object(bot, "api_json", return_value=(200, {"status": "undone"}))
    def test_undo_callback_uses_action_endpoint(self, api_json, tg_call):
        bot._state = {"1": {"token": "token", "conv_id": "conversation-1"}}
        bot.handle_callback(1, "callback-1", "undo:action-1")
        self.assertEqual(api_json.call_args.args[:2], ("POST", "/api/ai/actions/action-1/undo"))
        tg_call.assert_called_with(
            "answerCallbackQuery", callback_query_id="callback-1", text="Undone (undone)."
        )

    @patch.object(bot, "authorized", return_value=True)
    @patch.object(bot, "save_state")
    @patch.object(bot, "tg_typing")
    def test_login_discards_stale_connection(self, _typing, _save, authorized):
        bot._state = {"1": {"token": "old", "conv_id": "old-conversation"}}
        bot.handle_message(1, "/login")
        self.assertEqual(bot._state["1"], {})
        authorized.assert_called_once_with(1)

    @patch.object(bot, "tg_send")
    @patch.object(bot, "save_state")
    @patch.object(bot, "_handle_update")
    def test_unauthorized_response_clears_token(self, handle, _save, send):
        bot._state = {"1": {"token": "expired", "conv_id": "conversation-1"}}
        handle.side_effect = urllib.error.HTTPError("url", 401, "Unauthorized", {}, None)
        bot.handle_update({"message": {"chat": {"id": 1}, "text": "hello"}})
        self.assertEqual(bot._state["1"], {})
        self.assertIn("/login", send.call_args.args[1])

    @patch.object(bot, "recover_reply")
    @patch.object(bot, "deliver_events")
    @patch.object(bot, "sb_agent_events", return_value=iter(()))
    @patch.object(bot, "sb_conv_for", return_value="conversation-1")
    @patch.object(bot, "authorized", return_value=True)
    @patch.object(bot, "tg_typing")
    def test_dropped_stream_falls_back_to_recover_reply(
        self, _typing, _auth, _conv, _events, deliver, recover
    ):
        bot._state = {"1": {"token": "token"}}
        deliver.side_effect = TimeoutError("connection dropped")
        bot.handle_message(1, "hello")
        recover.assert_called_once()
        self.assertEqual(recover.call_args.args[:3], (1, "conversation-1", "token"))

    @patch.object(bot, "deliver_events")
    @patch.object(bot, "sb_agent_events", return_value=iter(()))
    @patch.object(bot, "sb_conv_for", return_value="conversation-1")
    @patch.object(bot, "authorized", return_value=True)
    @patch.object(bot, "tg_typing")
    def test_401_during_stream_still_propagates(self, _typing, _auth, _conv, _events, deliver):
        bot._state = {"1": {"token": "token"}}
        deliver.side_effect = urllib.error.HTTPError("url", 401, "Unauthorized", {}, None)
        with self.assertRaises(urllib.error.HTTPError):
            bot.handle_message(1, "hello")

    @patch.object(bot.time, "sleep")
    @patch.object(bot, "tg_send")
    @patch.object(bot, "api_json")
    def test_recover_reply_delivers_message_once_it_lands(self, api_json, send, _sleep):
        since = datetime.now(UTC) - timedelta(seconds=1)
        landed_at = (since + timedelta(seconds=5)).isoformat()
        api_json.return_value = (
            200,
            {
                "pending_actions": [],
                "messages": [{"role": "assistant", "content": "All set", "created_at": landed_at}],
            },
        )
        bot.recover_reply(1, "conversation-1", "token", since)
        send.assert_called_once_with(1, "All set", markdown=False)

    @patch.object(bot, "tg_send")
    @patch.object(bot, "api_upload_file")
    @patch.object(bot, "tg_download_file", return_value=b"data")
    @patch.object(bot, "tg_call", return_value={"result": {"file_path": "p"}})
    @patch.object(bot, "authorized", return_value=True)
    def test_photo_upload_failure_notifies_user(self, _auth, _tg_call, _dl, upload, send):
        upload.side_effect = urllib.error.HTTPError("url", 500, "Server Error", {}, None)
        bot._state = {"1": {"token": "token"}}
        bot.handle_photo(1, [{"file_id": "f1"}], "")
        send.assert_called_once_with(1, "⚠️ Could not process that photo.")

    def test_get_updates_forwards_long_poll_timeout_to_telegram(self):
        response = MagicMock()
        response.read.return_value = b'{"result": []}'
        response.__enter__.return_value = response
        with patch("urllib.request.urlopen", return_value=response) as urlopen:
            bot.tg_call("getUpdates", sock_timeout=70, offset=5, timeout=50)
        request = urlopen.call_args.args[0]
        self.assertEqual(json.loads(request.data), {"offset": 5, "timeout": 50})
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 70)


class StripMarkdownTests(unittest.TestCase):
    def test_bold_and_code_removed(self):
        self.assertEqual(bot.strip_markdown("**bold** and `code`"), "bold and code")

    def test_code_fence_removed(self):
        self.assertEqual(bot.strip_markdown("```python\nx = 1\n```"), "x = 1\n")

    def test_plain_text_unchanged(self):
        self.assertEqual(bot.strip_markdown("just plain text"), "just plain text")


class SplitTextTests(unittest.TestCase):
    def test_short_text_not_split(self):
        self.assertEqual(bot.split_text("hello"), ["hello"])

    def test_long_text_splits_under_limit(self):
        text = "line\n" * 2000
        chunks = bot.split_text(text)
        self.assertGreater(len(chunks), 1)
        for chunk in chunks:
            self.assertLessEqual(len(chunk), bot.MSG_LIMIT)


class MultipartBodyTests(unittest.TestCase):
    def test_boundary_wraps_body_and_matches_header(self):
        body, boundary = bot._multipart_body("photo.jpg", "image/jpeg", b"\xff\xd8\xff")
        text = body.decode("latin-1")
        self.assertTrue(text.startswith(f"--{boundary}\r\n"))
        self.assertTrue(text.rstrip("\r\n").endswith(f"--{boundary}--"))
        self.assertIn('filename="photo.jpg"', text)
        self.assertIn("Content-Type: image/jpeg", text)
        self.assertIn("\xff\xd8\xff", text)


if __name__ == "__main__":
    unittest.main()
