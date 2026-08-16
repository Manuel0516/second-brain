"""Stdlib-only checks for bot.py's pure text-formatting logic (no network)."""

import json
import os
import sys
import threading
import time
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
        self._threads_before = threading.active_count()

    def tearDown(self):
        self._wait_for_threads()

    def _wait_for_threads(self):
        """The typing thread is a daemon on a 4s tick, so it stops shortly after
        done() sets the event rather than instantly."""
        deadline = time.time() + 3
        while threading.active_count() > self._threads_before and time.time() < deadline:
            time.sleep(0.02)
        return threading.active_count()

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

    @patch.object(bot, "tg_typing")
    @patch.object(bot, "tg_call")
    @patch.object(bot, "tg_send")
    def test_tool_progress_is_posted_live_and_edited_in_place(self, send, tg_call, _typing):
        """The tool list used to be sent only after the turn finished, telling the user
        what the bot *had* done long after it mattered. It is now one message posted on
        the first tool and edited as more run (see history 0255)."""
        tg_call.return_value = {"result": {"message_id": 77}}
        bot.deliver_events(
            1,
            "conversation-1",
            [
                {"type": "tool_call", "name": "willys_offers"},
                {"type": "tool_call", "name": "get_page"},
                {"type": "text_delta", "content": "Done"},
                {"type": "done"},
            ],
        )
        methods = [call.args[0] for call in tg_call.call_args_list]
        assert methods[0] == "sendMessage"
        assert set(methods[1:]) == {"editMessageText"}
        # Every edit targets the same message, and the last one drops the ellipsis.
        assert all(c.kwargs["message_id"] == 77 for c in tg_call.call_args_list[1:])
        assert tg_call.call_args_list[-1].kwargs["text"] == "🔧 willys_offers, get_page"
        # The answer itself still goes out exactly once, unchanged.
        send.assert_called_once_with(1, "Done", markdown=False)

    @patch.object(bot, "tg_typing")
    @patch.object(bot, "tg_call")
    @patch.object(bot, "tg_send")
    def test_no_progress_message_when_no_tools_run(self, _send, tg_call, _typing):
        bot.deliver_events(
            1, "conversation-1", [{"type": "text_delta", "content": "Hi"}, {"type": "done"}]
        )
        posted = [c.args[0] for c in tg_call.call_args_list if c.args]
        assert "sendMessage" not in posted and "editMessageText" not in posted

    @patch.object(bot, "tg_typing")
    @patch.object(bot, "tg_send")
    def test_typing_thread_stops_even_if_the_stream_raises(self, _send, _typing):
        """A dropped stream must not leave a typing thread running forever — the caller
        falls back to recover_reply and that turn is over."""

        def boom():
            yield {"type": "tool_call", "name": "search_pages"}
            raise urllib.error.URLError("dropped")

        with patch.object(bot, "tg_call", return_value={"result": {"message_id": 5}}):
            with self.assertRaises(urllib.error.URLError):
                bot.deliver_events(1, "conversation-1", boom())
        assert self._wait_for_threads() == self._threads_before

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
